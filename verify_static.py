"""Verify and optionally copy only the standalone static demonstration artifact."""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import re
import shutil

BASE = {'index.html', 'styles.css', 'demo.css', 'demo.js', 'demo-data.js', 'favicon.svg', '.nojekyll'}
CASE_KEYS = {'id', 'diagnosis_question', 'source_image', 'input_image', 'attributes', 'heatmap_attribute_ids',
             'display_label', 'presentation_scores'}
ATTRIBUTE_KEYS = {'id', 'label', 'annotation_question', 'answer_options', 'positive_prompt', 'negative_prompt',
                  'score_pos', 'score_neg', 'score', 'prediction', 'map_image', 'plain_image', 'score_status', 'score_definition', 'score_note'}
FULL_ATTRIBUTES = {'breast': ('shape', 'margin', 'echogenicity', 'posterior_features', 'halo', 'calcifications', 'skin_thickening'),
                   'luna': ('calcification', 'lobulation', 'margin', 'sphericity', 'spiculation', 'texture')}
HEATMAP_ATTRIBUTES = {'breast': ('shape', 'margin', 'halo', 'calcifications'),
                     'luna': ('lobulation', 'margin', 'spiculation', 'texture')}
FEATURED_IDS = {'breast': ('b002', 'b006'), 'luna': ('l002', 'l001')}
FEATURED_LABELS = {'b002': 'Case 244', 'b006': 'Case 158', 'l002': 'Case 545', 'l001': 'Case 283'}


def verify(source: Path):
    raw = (source / 'demo-data.js').read_text(encoding='utf-8')
    prefix = 'window.DEMO_DATA = '
    if not raw.startswith(prefix) or not raw.rstrip().endswith(';'):
        raise ValueError('Invalid static demonstration data.')
    data = json.loads(raw[len(prefix):].rstrip()[:-1])
    if set(data) != {'version', 'modules'} or set(data['modules']) != {'breast', 'luna'}:
        raise ValueError('Only the demonstration version and two dataset modules are public.')
    allowed = set(BASE)
    counts = {'cases': 0, 'attributes': 0, 'heatmaps': 0, 'available_scores': 0,
              'presentation_cases': 0, 'presentation_scores': 0}
    for module in ('breast', 'luna'):
        if set(data['modules'][module]) != {'label', 'cases'}:
            raise ValueError('Unexpected dataset metadata.')
        cases = data['modules'][module]['cases']
        if len(cases) != 25:
            raise ValueError('Both datasets must retain their 25 demonstration cases.')
        if tuple(c['id'] for c in cases[:2]) != FEATURED_IDS[module] or len({c['id'] for c in cases}) != 25:
            raise ValueError('Featured presentation cases must appear first without duplicate cases.')
        for case in cases:
            if set(case) != CASE_KEYS or tuple(a['id'] for a in case['attributes']) != FULL_ATTRIBUTES[module]:
                raise ValueError('Unexpected case data; private metadata is not part of the demo.')
            if tuple(case['heatmap_attribute_ids']) != HEATMAP_ATTRIBUTES[module]:
                raise ValueError('Unexpected selected heatmap subset.')
            presentation = case['presentation_scores']
            if case['id'] in FEATURED_IDS[module]:
                if case['display_label'] != FEATURED_LABELS[case['id']] or not isinstance(presentation, dict) or set(presentation) != set(FULL_ATTRIBUTES[module]):
                    raise ValueError('Featured cases require their explicit illustrative score set and label.')
                if not all(type(n) in (int, float) and math.isfinite(n) and -1 <= n <= 1 for n in presentation.values()):
                    raise ValueError('Illustrative scores must be finite values in the score range.')
                counts['presentation_cases'] += 1
                counts['presentation_scores'] += len(presentation)
            elif presentation is not None or case['display_label'] != '':
                raise ValueError('Only the four featured cases may have illustrative presentation values.')
            counts['cases'] += 1
            images = [case['source_image'], case['input_image']]
            for attr in case['attributes']:
                if set(attr) != ATTRIBUTE_KEYS or set(attr['answer_options']) != {'present', 'absent', 'cannot_assess'}:
                    raise ValueError('Unexpected attribute data.')
                if attr['id'] in case['heatmap_attribute_ids']:
                    images.append(attr['map_image'])
                    counts['heatmaps'] += 1
                elif attr['map_image'] is not None:
                    raise ValueError('Only selected attributes may have heatmaps.')
                images.append(attr['plain_image'])
                values = [attr[k] for k in ('score_pos', 'score_neg', 'score')]
                if attr['score_status'] == 'available':
                    if not all(type(n) in (int, float) and math.isfinite(n) for n in values) or abs(values[0]-values[1]-values[2]) > 1e-6:
                        raise ValueError('Displayed evidence must preserve its numeric contrast.')
                    expected = 'present' if attr['score'] > 0 else 'absent' if attr['score'] < 0 else 'neutral'
                    if attr['prediction'] != expected:
                        raise ValueError('Prediction must match the full-precision score sign.')
                    counts['available_scores'] += 1
                elif attr['score_status'] != 'unavailable' or any(n is not None for n in values) or attr['prediction'] is not None:
                    raise ValueError('Unavailable scores must be explicit and nonnumeric.')
                counts['attributes'] += 1
            for image in images:
                if not re.fullmatch(r'\./assets/[a-z][0-9]{3}/[a-z_]+\.png', image):
                    raise ValueError('Invalid image URL.')
                allowed.add(image[2:])
    for relative in allowed:
        p = source / relative
        if not p.is_file() or p.is_symlink() or not p.resolve().is_relative_to(source.resolve()):
            raise ValueError(f'Missing or unsafe static file: {relative}')
    html = (source / 'index.html').read_text(encoding='utf-8')
    js = (source / 'demo.js').read_text(encoding='utf-8')
    if re.search(r'\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\b|sendBeacon\s*\(|(?:session|local)Storage\b)|/api/', js):
        raise ValueError('The professor demonstration must not contact an API or persist responses.')
    if 'connect-src \'none\'' not in html:
        raise ValueError('Static demonstration must disable API connections through CSP.')
    counts['png_assets'] = len(allowed - BASE)
    if {k: counts[k] for k in ('cases','attributes','heatmaps','png_assets')} != {'cases': 50, 'attributes': 325, 'heatmaps': 200, 'png_assets': 300}:
        raise ValueError('Unexpected demonstration counts.')
    if (counts['presentation_cases'], counts['presentation_scores']) != (4, 26):
        raise ValueError('Unexpected illustrative score coverage.')
    return sorted(allowed), counts


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('.'))
    parser.add_argument('--build', type=Path)
    args = parser.parse_args()
    names, counts = verify(args.source)
    if args.build:
        if args.build.exists():
            raise SystemExit('Choose a fresh artifact directory.')
        for name in names:
            target = args.build / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(args.source / name, target)
    print(json.dumps({'verified': counts, 'files': len(names), 'no_backend': True}))
