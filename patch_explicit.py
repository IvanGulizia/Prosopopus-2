import re

with open('store/useStore.ts', 'r') as f:
    content = f.read()

# Freehand logic
regex1 = re.compile(r'// Explicit selection overrides checks\.\s*if \(selectedSlotId\) \{\s*const sel = canonicalSlots\.find\(s => s\.id === selectedSlotId\);\s*if \(sel\) \{\s*targetSlotStroke = sel;\s*\}\s*\}')
replacement1 = """// Explicit selection: only use it if it's UNFILLED in the current keyframe.
      // If it's already filled, the user is drawing a new stroke, so we shouldn't overwrite the existing one.
      if (selectedSlotId) {
        const sel = canonicalSlots.find(s => s.id === selectedSlotId);
        if (sel) {
          const inCurrent = currentStrokes.find(s => s.id === sel.id);
          const isUnfilled = !inCurrent || !inCurrent.points || inCurrent.points.length === 0;
          if (isUnfilled) {
            targetSlotStroke = sel;
          }
        }
      }"""
content = regex1.sub(replacement1, content)

# Shape logic
regex2 = re.compile(r'// Explicit selection overrides shape type check\. If they explicitly selected a slot, they want to draw on it\.\s*if \(selectedSlotId\) \{\s*const sel = canonicalSlots\.find\(s => s\.id === selectedSlotId\);\s*if \(sel\) \{\s*targetSlotStroke = sel;\s*\}\s*\}')
replacement2 = """// Explicit selection: only use it if it's UNFILLED in the current keyframe.
      if (selectedSlotId) {
        const sel = canonicalSlots.find(s => s.id === selectedSlotId);
        if (sel) {
          const inCurrent = currentStrokes.find(s => s.id === sel.id);
          const isUnfilled = !inCurrent || !inCurrent.points || inCurrent.points.length === 0;
          if (isUnfilled) {
            targetSlotStroke = sel;
          }
        }
      }"""
content = regex2.sub(replacement2, content)

with open('store/useStore.ts', 'w') as f:
    f.write(content)
print("Patched overwrite logic.")
