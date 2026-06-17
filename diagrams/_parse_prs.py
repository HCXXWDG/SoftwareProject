import json
with open(r'C:\Users\lenovo\.qoder\cache\projects\SoftwareProject-main-dfffbae6\agent-tools\task-66c\3b232f1c.txt', 'r', encoding='utf-8') as f:
    prs = json.load(f)
for p in prs:
    n = p['number']
    t = p['title']
    s = p['state']
    draft = ' [DRAFT]' if p.get('draft') else ''
    base = p['base']['ref']
    head = p['head']['ref']
    print(f'#{n:2d} | {s:6s}{draft} | {head} -> {base} | {t}')
