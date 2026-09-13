import re

with open('store/useStore.ts', 'r') as f:
    content = f.read()

# Fix shape drawing explicit selection
regex_shape = re.compile(r'// Only target selected slot if user explicitly selected it AND it\'s of the same shape type\s*if \(selectedSlotId\) \{\s*const sel = canonicalSlots\.find\(s => s\.id === selectedSlotId\);\s*if \(sel && sel\.shapeConfig\?\.type === config\.type\) \{\s*targetSlotStroke = sel;\s*\}\s*\}')
replacement_shape = """// Explicit selection overrides shape type check. If they explicitly selected a slot, they want to draw on it.
      if (selectedSlotId) {
        const sel = canonicalSlots.find(s => s.id === selectedSlotId);
        if (sel) {
          targetSlotStroke = sel;
        }
      }"""
content = regex_shape.sub(replacement_shape, content)

# Fix freehand drawing explicit selection
regex_freehand = re.compile(r'// Only attach to an existing slot if user explicitly selected it AND it\'s a freehand slot\s*if \(selectedSlotId\) \{\s*const sel = canonicalSlots\.find\(s => s\.id === selectedSlotId\);\s*if \(sel && !sel\.shapeConfig\) \{\s*targetSlotStroke = sel;\s*\}\s*\}')
replacement_freehand = """// Explicit selection overrides checks.
      if (selectedSlotId) {
        const sel = canonicalSlots.find(s => s.id === selectedSlotId);
        if (sel) {
          targetSlotStroke = sel;
        }
      }"""
content = regex_freehand.sub(replacement_freehand, content)


with open('store/useStore.ts', 'w') as f:
    f.write(content)
print("Patched useStore.ts")
