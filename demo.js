'use strict';

// This walkthrough holds optional form selections in memory only. Reloading clears them.
(() => {
  const app = document.querySelector('#app');
  const dialog = document.querySelector('#image-dialog');
  const data = window.DEMO_DATA;
  const stages = ['Image only', 'Image + attribute scores', 'Image + scores + heatmaps'];
  const names = {breast: 'BrEaST', luna: 'LUNA16'};
  const drafts = new Map();
  let moduleId = null;
  let caseIndex = 0;
  let stage = 0;
  let finished = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const paths = {
    arrow:'M4 12h16m-6-6 6 6-6 6', back:'M20 12H4m6-6-6 6 6 6',
    heart:'M12 21S2 14 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 13-10 13Z',
    scan:'M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4M7 12h10M12 7v10',
    zoom:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    image:'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M8 8h.01',
    check:'m5 12 4 4L19 6'
  };
  const icon = name => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name] || paths.image}"/></svg>`;
  const currentModule = () => data.modules[moduleId];
  const currentCase = () => currentModule().cases[caseIndex];
  const key = () => `${moduleId}:${caseIndex}:${stage}`;
  const draft = () => {
    if (!drafts.has(key())) drafts.set(key(), {});
    return drafts.get(key());
  };
  const entry = scope => {
    const d = draft();
    if (!d[scope]) d[scope] = {};
    return d[scope];
  };
  const fmt = value => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(4)}` : '—';
  const isPresentationCase = () => Boolean(currentCase().presentation_scores);
  const displayedScore = a => isPresentationCase() ? currentCase().presentation_scores[a.id] : a.score;
  const scoreAvailable = a => Number.isFinite(displayedScore(a)) && (isPresentationCase() || a.score_status !== 'unavailable');
  const prediction = a => {
    const score = displayedScore(a);
    const option = isPresentationCase() ? score > 0 ? 'present' : score < 0 ? 'absent' : null : a.prediction;
    return a.answer_options?.[option] || 'No preference';
  };
  const caseLabel = (c, index) => c.display_label || `Case ${String(index+1).padStart(2,'0')}`;
  const selectedHeatmaps = () => (currentCase().heatmap_attribute_ids || [])
    .map(id => currentCase().attributes.find(a => a.id === id))
    .filter(a => a?.map_image);
  const attributeCountLabel = id => {
    const counts = [...new Set(data.modules[id].cases.map(c => c.attributes.length))];
    return counts.length === 1 ? `${counts[0]} attributes` : 'All attributes';
  };

  function header() {
    return `<header class="topbar"><a class="brand" href="#" data-action="home" aria-label="Image Assessment home"><span class="brand-mark" aria-hidden="true"></span><span><span class="brand-name">Image Assessment</span><span class="brand-sub">DIAGNOSIS &amp; CONCEPTS</span></span></a><div class="top-meta"><span class="pill">${moduleId ? esc(names[moduleId]) : 'BrEaST + LUNA16'}</span>${moduleId ? '<button class="btn ghost small" type="button" data-action="home">Change dataset</button>' : ''}</div></header>`;
  }

  function home() {
    return `${header()}<main id="main-content"><div class="landing demo-landing"><section class="landing-copy"><div class="kicker">Diagnosis + concept annotation</div><h1>Two tasks.<br>Three perspectives.</h1><p>Assess whether a lesion is benign or malignant and annotate its visual attributes. Review the image, attribute scores, and heatmaps across three steps.</p></section><section class="dataset-cards" aria-label="Choose a dataset">${['breast','luna'].map(id => `<article class="dataset-card"><div class="icon-box ${id === 'luna' ? 'gold' : ''}">${icon(id === 'breast' ? 'heart' : 'scan')}</div><div><h2>${names[id]}</h2><p>${esc(data.modules[id].label)}</p><div class="dataset-count">${data.modules[id].cases.length} cases · ${attributeCountLabel(id)} · 3 steps</div></div><button class="btn full" type="button" data-action="start" data-module="${id}">Explore ${names[id]} ${icon('arrow')}</button></article>`).join('')}</section></div><section class="flow-strip demo-flow" aria-label="Study sequence">${[['01','Image only','Diagnosis + all attribute annotations'],['02','Attribute scores','Reassess both tasks with attribute scores'],['03','Heatmap review','Reassess both tasks with visual evidence']].map(s => `<div class="flow-point"><span class="flow-number">${s[0]}</span><div><h3>${s[1]}</h3><p>${s[2]}</p></div></div>`).join('')}</section></main>`;
  }

  function casePicker(id) {
    return `<label class="field-label" for="${id}">Explore a case</label><select class="case-select" id="${id}" data-case-select>${currentModule().cases.map((c,i) => `<option value="${i}" ${i === caseIndex ? 'selected' : ''}>${esc(caseLabel(c,i))} · ${esc(c.id)}</option>`).join('')}</select>`;
  }
  function caseButtons() {
    return `<button class="btn secondary small" type="button" data-action="prev-case" ${caseIndex === 0 ? 'disabled' : ''} aria-label="Previous case">${icon('back')} Previous</button><button class="btn secondary small" type="button" data-action="next-case" ${caseIndex === currentModule().cases.length - 1 ? 'disabled' : ''} aria-label="Next case">Next ${icon('arrow')}</button>`;
  }
  function sidebar() {
    return `<aside class="sidebar" aria-label="Study navigation"><div><div class="kicker">Your dataset</div><div class="module-name">${esc(names[moduleId])}</div><div class="progress-text"><span>Case ${caseIndex+1} of ${currentModule().cases.length}</span><span>Step ${stage+1} of 3</span></div></div><div>${casePicker('case-select')}<div class="case-nav">${caseButtons()}</div></div><ol class="steps">${[['Image only','Initial judgments'],['Attribute scores','Add score evidence'],['Heatmaps','Review visual evidence']].map((s,i) => `<li class="${i === stage ? 'active' : ''}" ${i === stage ? 'aria-current="step"' : ''}><button type="button" data-stage="${i}" aria-label="Step ${i+1}: ${s[0]}"><span class="step-num">${i+1}</span><span><strong>${s[0]}</strong><small>${s[1]}</small></span></button></li>`).join('')}</ol><div class="sidebar-note">Both tasks appear at every step. Confidence is optional for each answer.</div></aside>`;
  }

  function imageBlock(url, label) {
    return `<div class="image-wrap"><img src="${esc(url)}" alt="${esc(label)}" draggable="false"><button class="zoom-btn" type="button" data-action="zoom" data-label="${esc(label)}" aria-label="Enlarge ${esc(label)}">${icon('zoom')}</button></div>`;
  }
  function sourcePanel() {
    const c = currentCase();
    return `<section class="panel source-panel"><div class="panel-header"><div><h2>Source image</h2><p>${moduleId === 'luna' ? 'Supplied axial CT slice' : 'Supplied ultrasound image'}</p></div></div><div class="source-grid"><div class="image-cell">${imageBlock(c.source_image,'Unmarked source image')}</div></div></section>`;
  }
  function prompts(a) {
    const positive = a.positive_prompt || a.prompts?.positive || a.prompts?.[0] || '';
    const negative = a.negative_prompt || a.prompts?.negative || a.prompts?.[1] || '';
    const showComponents = !isPresentationCase() && scoreAvailable(a) && Number.isFinite(a.score_pos) && Number.isFinite(a.score_neg);
    return `<details class="prompt-details"><summary>View descriptions${showComponents ? ' and scores' : ''}</summary><div class="prompt-line"><strong>Positive${showComponents ? ` · ${a.score_pos.toFixed(4)}` : ''}</strong><br>${esc(positive)}</div><div class="prompt-line"><strong>Negative${showComponents ? ` · ${a.score_neg.toFixed(4)}` : ''}</strong><br>${esc(negative)}</div></details>`;
  }
  function scoreResult(a) {
    return scoreAvailable(a)
      ? `<span class="prediction">${esc(prediction(a))}</span><span class="margin-value">${fmt(displayedScore(a))}</span>`
      : '<span class="score-unavailable">Score unavailable</span>';
  }
  function advicePanel() {
    const attributes = currentCase().attributes;
    const globalMargins = attributes.filter(scoreAvailable).every(a => !a.score_definition || a.score_definition === 'global_cosine_margin');
    const description = isPresentationCase() ? '<span class="presentation-score-label">Illustrative presentation scores</span> · signs refer to the positive or negative descriptions.' : globalMargins ? 'Score = positive − negative · not a cancer probability' : 'Attribute-specific AI scores · not a cancer probability';
    return `<section class="panel" id="attribute-scores"><div class="panel-header"><div><h2>${isPresentationCase() ? 'Attribute scores' : 'AI attribute evidence'}</h2><p>${description}</p></div><span class="pill">${attributes.length} attributes</span></div><div class="advice-grid">${attributes.map(a => `<article class="advice-card" data-score-attribute="${esc(a.id)}"><div class="attribute-line"><h3>${esc(a.label)}</h3></div><div class="prediction-line">${scoreResult(a)}</div>${prompts(a)}</article>`).join('')}</div><div class="visual-foot">Positive and negative refer to the attribute descriptions, not to benign or malignant status.</div></section>`;
  }
  function heatmapPanel() {
    const maps = selectedHeatmaps();
    return `<section class="review-section" id="heatmaps"><div class="review-section-heading"><div class="kicker">Visual evidence</div><h2>Selected attribute heatmaps <span class="pill">${maps.length} heatmaps</span></h2><p>Explore each heatmap or toggle back to its plain image.</p></div><div class="review-grid">${maps.map(a => `<section class="panel map-panel" data-map-card="${esc(a.id)}"><div class="panel-header"><div><h2>${esc(a.label)}</h2><p class="map-score">${scoreResult(a)}</p></div></div>${imageBlock(a.map_image,`${a.label} heatmap`)}<div class="image-caption"><span data-map-caption>Heatmap</span><button class="btn secondary small" type="button" data-action="toggle-map" data-attribute="${esc(a.id)}" aria-pressed="false">Show plain view</button></div><div style="padding:0 12px 12px">${prompts(a)}</div></section>`).join('')}</div></section>`;
  }

  function confidenceField(scope, label) {
    const d = entry(scope);
    const disabled = d.answer === 'cannot_assess';
    return `<fieldset class="response-group confidence-group"><legend>${esc(label)}<span class="optional-label">Optional · 0–100</span></legend><div class="confidence-box"><div class="confidence-top"><label class="sr-only" for="confidence-${esc(scope)}">${esc(label)} from 0 to 100; leave blank to skip</label><input class="confidence-number" id="confidence-${esc(scope)}" type="number" inputmode="numeric" min="0" max="100" step="1" data-confidence-scope="${esc(scope)}" value="${disabled ? '' : d.confidence ?? ''}" placeholder="${disabled ? 'N/A' : 'Not rated'}" ${disabled ? 'disabled' : ''}><button class="text-link" type="button" data-action="clear-confidence" data-scope="${esc(scope)}" ${disabled ? 'disabled' : ''}>Skip / clear</button></div><input class="range" type="range" min="0" max="100" step="1" data-confidence-scope="${esc(scope)}" value="${d.confidence ?? 50}" aria-label="${esc(label)} from zero to one hundred" aria-valuetext="${disabled ? 'Not applicable' : d.confidence == null ? 'Not rated' : d.confidence}" ${disabled ? 'disabled' : ''}><div class="range-labels"><span>0 · Not at all confident</span><span>100 · Completely confident</span></div>${disabled ? '<p class="confidence-na">Not applicable to “Cannot assess”.</p>' : ''}</div></fieldset>`;
  }
  function answers(scope, options, cssClass) {
    return `<div class="${cssClass}">${Object.entries(options).map(([value,label]) => `<label class="answer-option"><input type="radio" name="${esc(scope)}" data-answer-scope="${esc(scope)}" value="${esc(value)}" ${entry(scope).answer === value ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`;
  }
  function conceptCard(a) {
    return `<article class="concept-card"><div class="concept-card-heading"><h3>${esc(a.label)}</h3></div><fieldset class="response-group concept-choice"><legend>${esc(a.annotation_question)}</legend>${answers(a.id,a.answer_options,'concept-options')}</fieldset><div data-confidence-container="${esc(a.id)}">${confidenceField(a.id,`Confidence in your ${a.label.toLowerCase()} answer`)}</div></article>`;
  }
  function nextLabel() {
    return stage === 0 ? 'Show attribute scores' : stage === 1 ? 'Show heatmaps' : caseIndex < currentModule().cases.length-1 ? 'Next case' : 'Finish review';
  }
  function stageControls(location) {
    return `<div class="${location === 'top' ? 'stage-control' : 'stage-footer'}"><button class="btn secondary" type="button" data-action="prev-stage" ${stage === 0 ? 'disabled' : ''}>${icon('back')} Back</button><button class="btn" type="button" data-action="next-stage">${nextLabel()} ${icon('arrow')}</button></div>`;
  }
  function assessmentPanel() {
    const c = currentCase();
    return `<section class="panel response-panel"><div class="response-intro"><div class="kicker">Step ${stage+1} of 3 · ${esc(stages[stage])}</div><p>Assess both tasks using the available evidence.</p><a class="text-link evidence-link" href="#case-evidence">Review the images ${icon('eye')}</a></div><form id="assessment-form"><section class="task-section" aria-labelledby="diagnosis-heading"><div class="task-heading"><span class="task-number">1</span><div><div class="kicker">Task 1</div><h2 id="diagnosis-heading">Diagnosis</h2></div></div><fieldset class="response-group"><legend class="question">${esc(c.diagnosis_question)}</legend>${answers('diagnosis',{benign:'Benign',malignant:'Malignant',cannot_assess:'Cannot assess'},'option-stack diagnosis-options')}</fieldset><div data-confidence-container="diagnosis">${confidenceField('diagnosis','Confidence in your diagnosis')}</div></section><section class="task-section" aria-labelledby="concept-heading"><div class="task-heading"><span class="task-number">2</span><div><div class="kicker">Task 2</div><h2 id="concept-heading">Concept annotation</h2></div></div><p class="annotation-help">Choose the description that matches your own assessment for each attribute.</p><div class="concept-cards">${c.attributes.map(conceptCard).join('')}</div></section><p class="demo-form-note">Confidence refers to the answer you chose.</p>${stageControls('bottom')}</form></section>`;
  }
  function workspace() {
    return `${header()}<div class="study-layout">${sidebar()}<main id="main-content" class="workspace"><div class="case-heading"><div><div class="kicker">${esc(names[moduleId])} · ${esc(caseLabel(currentCase(),caseIndex))} · ${caseIndex+1} of ${currentModule().cases.length}</div><h1>${stages[stage]}</h1></div>${stageControls('top')}</div><div class="mobile-case-controls">${casePicker('mobile-case-select')}${caseButtons()}</div><div class="workspace-grid"><div class="visual-area" id="case-evidence" role="region" aria-label="Case images and available evidence" tabindex="0">${sourcePanel()}${stage > 0 ? advicePanel() : ''}${stage === 2 ? heatmapPanel() : ''}</div>${assessmentPanel()}</div></main></div>`;
  }
  function finish() {
    return `${header()}<main id="main-content" class="complete-panel"><div class="complete-icon">${icon('check')}</div><div class="kicker">Review complete</div><h1>You have reached the final case.</h1><p>Review the last case or choose another dataset.</p><div class="demo-finish-actions"><button class="btn secondary" type="button" data-action="return">Back to last case</button><button class="btn" type="button" data-action="home">Explore another dataset ${icon('arrow')}</button></div></main>`;
  }
  function render() {
    if (dialog.open) dialog.close();
    app.innerHTML = !moduleId ? home() : finished ? finish() : workspace();
    window.scrollTo({top:0, behavior:'instant'});
  }
  function redrawConfidence(scope) {
    const container = [...document.querySelectorAll('[data-confidence-container]')].find(el => el.dataset.confidenceContainer === scope);
    const label = scope === 'diagnosis' ? 'Confidence in your diagnosis' : `Confidence in your ${currentCase().attributes.find(a => a.id === scope).label.toLowerCase()} answer`;
    if (container) container.innerHTML = confidenceField(scope,label);
  }
  document.addEventListener('submit', e => e.preventDefault());
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-case-select]')) {
      caseIndex = Number(el.value); stage = 0; render();
    } else if (el.dataset.answerScope) {
      const d = entry(el.dataset.answerScope);
      d.answer = el.value;
      if (d.answer === 'cannot_assess') d.confidence = null;
      redrawConfidence(el.dataset.answerScope);
    }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset.confidenceScope || !moduleId) return;
    if (el.type === 'number' && el.value !== '' && !el.validity.valid) return;
    const d = entry(el.dataset.confidenceScope);
    if (d.answer === 'cannot_assess') return;
    d.confidence = el.value === '' ? null : Number(el.value);
    const box = el.closest('.confidence-box');
    box.querySelector('input[type="number"]').value = d.confidence ?? '';
    const range = box.querySelector('input[type="range"]');
    range.value = d.confidence ?? 50;
    range.setAttribute('aria-valuetext',d.confidence == null ? 'Not rated' : String(d.confidence));
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action],[data-stage]');
    if (!b || b.disabled) return;
    if (b.tagName === 'A') e.preventDefault();
    if (b.hasAttribute('data-stage')) {stage = Number(b.dataset.stage); render(); return;}
    const action = b.dataset.action;
    if (action === 'home') {moduleId = null; finished = false; render();}
    else if (action === 'start') {moduleId = b.dataset.module; caseIndex = 0; stage = 0; finished = false; render();}
    else if (action === 'prev-stage') {stage = Math.max(0,stage-1); render();}
    else if (action === 'next-stage') {
      if (stage < 2) stage++;
      else if (caseIndex < currentModule().cases.length-1) {caseIndex++; stage = 0;}
      else finished = true;
      render();
    } else if (action === 'next-case' || action === 'prev-case') {
      caseIndex = Math.max(0,Math.min(currentModule().cases.length-1,caseIndex+(action === 'next-case' ? 1 : -1))); stage = 0; render();
    } else if (action === 'return') {finished = false; render();}
    else if (action === 'clear-confidence') {entry(b.dataset.scope).confidence = null; redrawConfidence(b.dataset.scope);}
    else if (action === 'zoom') {
      const image = b.closest('.image-wrap').querySelector('img');
      dialog.querySelector('.dialog-image-wrap').innerHTML = `<img src="${esc(image.src)}" alt="${esc(image.alt)}">`;
      dialog.querySelector('.dialog-caption').textContent = image.alt;
      dialog.showModal();
    } else if (action === 'toggle-map') {
      const a = currentCase().attributes.find(a => a.id === b.dataset.attribute);
      const card = b.closest('.map-panel');
      const image = card.querySelector('img');
      const showPlain = b.getAttribute('aria-pressed') !== 'true';
      image.src = showPlain ? a.plain_image : a.map_image;
      image.alt = `${a.label} ${showPlain ? 'plain view' : 'heatmap'}`;
      card.querySelector('[data-map-caption]').textContent = showPlain ? 'Plain view' : 'Heatmap';
      b.textContent = showPlain ? 'Show heatmap' : 'Show plain view';
      b.setAttribute('aria-pressed',String(showPlain));
    }
  });
  dialog.querySelector('.dialog-close').addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',e => {if (e.target === dialog) dialog.close();});
  if (!data?.modules?.breast?.cases?.length || !data?.modules?.luna?.cases?.length) {
    app.innerHTML = '<main class="screen-error panel"><h1>The study data is missing.</h1><p>Open the complete website folder, including demo-data.js and assets.</p></main>';
  } else render();
})();
