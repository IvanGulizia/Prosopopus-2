import re

with open('components/Panels.tsx', 'r') as f:
    content = f.read()

regex = re.compile(r'<button\s*onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*addCompSlot\(layer\.id\);\s*\}\}\s*className="flex items-center justify-center gap-1\.5 py-1 px-2 mt-1 rounded-xl text-\[11px\] font-medium text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/80 border border-dashed border-emerald-300 transition-colors"\s*title="Ajouter un nouveau sous-calque vide synchronisé sur toutes les poses"\s*>\s*<Plus size=\{12\} />\s*<span>Nouveau sous-calque</span>\s*</button>')

if match := regex.search(content):
    content = content[:match.start()] + content[match.end():]
    with open('components/Panels.tsx', 'w') as f:
        f.write(content)
    print("Removed addCompSlot button.")
else:
    print("Could not find button.")
