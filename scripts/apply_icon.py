import os
import sys
import shutil

STYLES_MAP = {
    # Main Styles
    '1': 'icon-style1-academic-crimson',
    'style1': 'icon-style1-academic-crimson',
    'crimson': 'icon-style1-academic-crimson',
    '2': 'icon-style2-geometric-flow',
    'style2': 'icon-style2-geometric-flow',
    'flow': 'icon-style2-geometric-flow',
    '3': 'icon-style3-clipboard-reading',
    'style3': 'icon-style3-clipboard-reading',
    'clipboard': 'icon-style3-clipboard-reading',
    '4': 'icon-style4-light-academic', # Default 4 points to recommended light academic
    '4-dark': 'icon-style4-minimal-line',
    'style4': 'icon-style4-light-academic',
    'line': 'icon-style4-light-academic',
    '4a': 'icon-style4-light-academic',
    '4b': 'icon-style4-light-indigo',
    '4c': 'icon-style4-light-forest',
    '4d': 'icon-style4-light-coral',
    '4e': 'icon-style4-light-mono',
    '4f': 'icon-style4-light-rose',
    'icon-style4-light-indigo': 'icon-style4-light-indigo',
    'academic': 'icon-style4-light-academic',
    'indigo': 'icon-style4-light-indigo',
    'forest': 'icon-style4-light-forest',
    'coral': 'icon-style4-light-coral',
    'mono': 'icon-style4-light-mono',
    'rose': 'icon-style4-light-rose',
    '5': 'icon-style5-academic-cap',
    'style5': 'icon-style5-academic-cap',
    'cap': 'icon-style5-academic-cap',
    # Style 7 / v11.2.4 Unbounded Flow (无边界全彩破界套件)
    '7': 'icon-style7-unbounded-flow',
    'style7': 'icon-style7-unbounded-flow',
    'unbounded': 'icon-style7-unbounded-flow',
    'v11': 'icon-style7-unbounded-flow',
    'v11.2.4': 'icon-style7-unbounded-flow',
    'default': 'icon-style7-unbounded-flow',
}

def apply_icon(choice):
    key = str(choice).lower().strip()
    if key not in STYLES_MAP:
        print(f"Unknown style: {choice}.")
        print("Valid options: 7 (default / v11.2.4 unbounded), 1, 2, 3, 4a, 4b, 4c, 4d, 4e, 4f, 4-dark, 5, 6")
        return False

    target_style = STYLES_MAP[key]
    print(f"Applying style: {target_style}...")

    # Destinations: chrome/content/icons and chrome/content/images
    dest_dirs = [
        os.path.join('chrome', 'content', 'icons'),
        os.path.join('chrome', 'content', 'images')
    ]

    sizes = [16, 32, 48, 128]

    for d in dest_dirs:
        if not os.path.exists(d):
            os.makedirs(d, exist_ok=True)
        for sz in sizes:
            src_png = os.path.join('icons', f"{target_style}-{sz}.png")
            if not os.path.exists(src_png):
                print(f"Warning: {src_png} does not exist.")
                continue
            
            # Copy both hyphenated and non-hyphenated forms for compatibility
            dest1 = os.path.join(d, f"icon-{sz}.png")
            dest2 = os.path.join(d, f"icon{sz}.png")
            shutil.copyfile(src_png, dest1)
            shutil.copyfile(src_png, dest2)
            print(f"Updated {dest1} & {dest2}")

        # Also copy master SVG
        src_svg = os.path.join('icons', f"{target_style}.svg")
        if os.path.exists(src_svg):
            with open(src_svg, 'r', encoding='utf-8') as source:
                svg_content = '\n'.join(line.rstrip() for line in source.read().splitlines()) + '\n'
            for filename in ("icon.svg", "todolist.svg"):
                dest_svg = os.path.join(d, filename)
                with open(dest_svg, 'w', encoding='utf-8', newline='\n') as output:
                    output.write(svg_content)
                print(f"Updated {dest_svg}")

    # Also update repo root icon.png (48x48) and icon@2x.png (96x96 if available)
    root_icon48 = os.path.join('icons', f"{target_style}-48.png")
    if os.path.exists(root_icon48):
        shutil.copyfile(root_icon48, 'icon.png')
    root_icon96 = os.path.join('icons', f"{target_style}-128.png")
    if os.path.exists('Todolist-Zotero-Icons-v11.2.4/icon@2x.png') and target_style.startswith('icon-style7'):
        shutil.copyfile('Todolist-Zotero-Icons-v11.2.4/icon@2x.png', 'icon@2x.png')
    elif os.path.exists(root_icon96):
        shutil.copyfile(root_icon96, 'icon@2x.png')

    print(f"\n[SUCCESS] Style '{target_style}' has been successfully applied to Todolist-Zotero!")
    return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python scripts/apply_icon.py <option>")
        print("Styles:")
        print("  7: Unbounded Flow / v11.2.4 (推荐：全新无边界全彩破界套件)")
        print("  1: Academic Crimson (经典学术红·文献与勾选)")
        print("  2: Geometric Flow (现代几何流光·Z与对勾共生)")
        print("  3: Reading Clipboard (拟物文献板夹·伴读与页码)")
        print("  4a: Minimal Line - Light Academic (象牙瓷白底 + 官方红Z + 翡翠绿勾)")
        print("  4b: Minimal Line - Light Indigo (科技瓷白底 + 靛蓝基调 + 紫罗兰Z + 薄荷青勾)")
        print("  4c: Minimal Line - Light Forest (典雅米纸底 + 墨绿书卷 + 金黄清单)")
        print("  4d: Minimal Line - Light Coral (暖桃杏仁底 + 珊瑚红Z + 鲜翠绿勾)")
        print("  4e: Minimal Line - Light Mono (极简包豪斯白 + 纯黑墨线 + 红书签点睛)")
        print("  4f: Minimal Line - Light Rose (柔粉象牙底 + 酒红墨线 + Zotero红)")
        print("  4-dark: Minimal Line - Dark Titanium (黑金钛晶深色版)")
        print("  5: Academic Cap (学士帽与待办·学位科研冲刺)")
        print("  6: Kanban Flow (敏捷三栏看板·文献流动卡片)")
        sys.exit(1)
    apply_icon(sys.argv[1])
