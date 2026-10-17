import os
import sys
from PyQt6.QtWidgets import QApplication
from PyQt6.QtSvg import QSvgRenderer
from PyQt6.QtGui import QImage, QPainter
from PyQt6.QtCore import QSize

def main():
    app = QApplication(sys.argv)
    styles = [
        'icon-style1-academic-crimson',
        'icon-style2-geometric-flow',
        'icon-style3-clipboard-reading',
        'icon-style4-minimal-line',
        'icon-style4-light-academic',
        'icon-style4-light-indigo',
        'icon-style4-light-forest',
        'icon-style4-light-coral',
        'icon-style4-light-mono',
        'icon-style4-light-rose',
        'icon-style5-academic-cap',
        'icon-style6-kanban-flow'
    ]
    sizes = [512, 128, 48, 32, 16]

    for style in styles:
        svg_path = f'icons/{style}.svg'
        if not os.path.exists(svg_path):
            print(f'Missing: {svg_path}')
            continue
        renderer = QSvgRenderer(svg_path)
        for sz in sizes:
            suffix = f'-{sz}.png' if sz != 512 else '.png'
            out_path = f'icons/{style}{suffix}'
            img = QImage(sz, sz, QImage.Format.Format_ARGB32)
            img.fill(0)
            painter = QPainter(img)
            renderer.render(painter)
            painter.end()
            img.save(out_path)
        print(f'Exported {style} in sizes: {sizes}')

if __name__ == '__main__':
    main()
