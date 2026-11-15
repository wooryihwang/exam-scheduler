# -*- coding: utf-8 -*-
"""고사시간표 시스템 아이콘(app.ico) 만들기: 붉은 둥근 사각형에 흰 '고' 글자."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
S = 256
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=52, fill=(185, 28, 28, 255))
d.rounded_rectangle([8, 8, S - 8, 70], radius=52, fill=(30, 42, 68, 255))
d.rectangle([8, 40, S - 8, 70], fill=(30, 42, 68, 255))
for x in (78, S - 78):
    d.rounded_rectangle([x - 9, 0, x + 9, 50], radius=8, fill=(255, 255, 255, 255))
font = None
for f in (r'C:\Windows\Fonts\malgunbd.ttf', r'C:\Windows\Fonts\malgun.ttf'):
    if os.path.exists(f):
        font = ImageFont.truetype(f, 150)
        break
d.text((S / 2, 160), '고', font=font, fill=(255, 255, 255, 255), anchor='mm')
img.save(os.path.join(HERE, 'app.ico'), sizes=[(256, 256), (64, 64), (48, 48), (32, 32), (16, 16)])
print('app.ico 생성')
