import os
import shutil

src_root = 'Todolist-Zotero-Icons-v11.2.4'
png_dir = os.path.join(src_root, 'main-png-exports')
sizes_dir = os.path.join(src_root, 'main-sizes')
variants_dir = os.path.join(src_root, 'main-color-variants')
mono_dir = os.path.join(src_root, 'ui-toolbar-monochrome')

# 1. Copy to repo root for extension package and add-on managers
shutil.copyfile(os.path.join(src_root, 'icon.png'), 'icon.png')
shutil.copyfile(os.path.join(src_root, 'icon@2x.png'), 'icon@2x.png')
print('Copied root icon.png and icon@2x.png')

# 2. Update icons/ catalog folder
os.makedirs('icons', exist_ok=True)
with open(os.path.join(src_root, 'icon.svg'), 'r', encoding='utf-8') as f:
    svg_raw = f.read()

# Make master SVG responsive with width="100%" height="100%" and strip trailing whitespace
svg_lines = [line.rstrip() for line in svg_raw.splitlines()]
responsive_svg = '\n'.join(svg_lines).replace('width="128" height="128"', 'width="100%" height="100%"') + '\n'

for base in ['icon-style7-unbounded-flow', 'icon-v11-unbounded']:
    with open(f'icons/{base}.svg', 'w', encoding='utf-8', newline='\n') as f:
        f.write(responsive_svg)
    shutil.copyfile(os.path.join(png_dir, 'icon-512.png'), f'icons/{base}.png')
    for sz in [16, 32, 48, 128]:
        shutil.copyfile(os.path.join(png_dir, f'icon-{sz}.png'), f'icons/{base}-{sz}.png')
print('Updated icons/ catalog with Style 7 / v11 Unbounded Flow')

# 3. Update chrome/content/icons and chrome/content/images
dest_dirs = [
    os.path.join('chrome', 'content', 'icons'),
    os.path.join('chrome', 'content', 'images')
]

for d in dest_dirs:
    os.makedirs(d, exist_ok=True)
    # Master SVGs
    for svg_name in ['icon.svg', 'todolist.svg']:
        with open(os.path.join(d, svg_name), 'w', encoding='utf-8', newline='\n') as f:
            f.write(responsive_svg)
    # Flat no-shadow SVG
    shutil.copyfile(os.path.join(src_root, 'icon-flat-no-shadow.svg'), os.path.join(d, 'icon-flat-no-shadow.svg'))
    
    # PNGs: all sizes with both hyphenated and non-hyphenated names
    for sz in [16, 32, 48, 64, 96, 128, 256, 512]:
        src_png = os.path.join(png_dir, f'icon-{sz}.png')
        if os.path.exists(src_png):
            shutil.copyfile(src_png, os.path.join(d, f'icon-{sz}.png'))
            shutil.copyfile(src_png, os.path.join(d, f'icon{sz}.png'))
    
    # Sub-icons: monochrome and color variants
    for f in os.listdir(mono_dir):
        if f.endswith('.svg'):
            shutil.copyfile(os.path.join(mono_dir, f), os.path.join(d, f))
    for f in os.listdir(variants_dir):
        if f.endswith('.svg'):
            shutil.copyfile(os.path.join(variants_dir, f), os.path.join(d, f))
    for f in os.listdir(sizes_dir):
        if f.endswith('.svg'):
            shutil.copyfile(os.path.join(sizes_dir, f), os.path.join(d, f))
    print(f'Populated {d}')
