import re
import os

cwd = r"c:\Users\user\Documents\OneDrive\桌面\Vibe_Coding_Test\ProJED"

def clean_types():
    path = os.path.join(cwd, "src", "types", "index.ts")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Remove `lists: List[];` from Board interface
    content = re.sub(r"\s*lists:\s*List\[\];", "", content)
    
    # Remove from `  // 列表/卡片 CRUD` to just before `  // Derived getters`
    # We will use search and replace using start and end markers
    start_marker = "  // 列表/卡片 CRUD"
    end_marker = "  // Derived getters"
    
    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    
    if start_idx != -1 and end_idx != -1:
        content = content[:start_idx] + content[end_idx:]
        
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
def clean_firestore_service():
    path = os.path.join(cwd, "src", "services", "firestoreService.ts")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove `List`, `Card` from imports
    content = re.sub(r"List,\s*Card,\s*", "", content)
        
    # Replace the `lists: [],` in board creation
    content = re.sub(r"\s*lists:\s*\[\],", "", content)
    
    # Replace `const { lists, dependencies, ...docData }` with `const { dependencies, ...docData }`
    content = re.sub(r"const\s+\{\s*lists,\s*dependencies,\s*\.\.\.docData\s*\}\s*=\s*board\s*as\s*any;", 
                     r"const { dependencies, ...docData } = board as any;", content)
    
    content = re.sub(r"const\s+\{\s*lists,\s*dependencies,\s*\.\.\.docData\s*\}\s*=\s*updates\s*as\s*any;", 
                     r"const { dependencies, ...docData } = updates as any;", content)
                     
    # Remove listService and cardService completely
    # They start at "// ==========================\n// List Service" and end at "// Node (WBS) Service" Wait, dependencyService is in between.
    
    # Regex to remove listService
    content = re.sub(r"// ==========================\n// List Service\n// ==========================\nexport const listService = \{.*?\n\};\n*", "", content, flags=re.DOTALL)
    
    # Regex to remove cardService
    content = re.sub(r"// ==========================\n// Card Service\n// ==========================\nexport const cardService = \{.*?\n\};\n*", "", content, flags=re.DOTALL)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

clean_types()
clean_firestore_service()
print("Cleaned types and firestore service.")
