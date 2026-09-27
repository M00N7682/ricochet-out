"""Puts each raw store screenshot on a 1290x2796 poster: headline, subline, framed shot."""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

RAW = sys.argv[1] if len(sys.argv) > 1 else 'store/raw'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'store/screenshots'
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
W, H = 1290, 2796
CAPS = [
    ('1-bounce', '거울에 닿으면 꺾인다', '화살표의 길을 읽고 탭!'),
    ('2-hint', '막히면 힌트가 길을 보여줘요', '나갈 수 있는 화살표와 경로 표시'),
    ('3-super', '25레벨마다 슈퍼 하드', '벽과 거울이 가득한 도전'),
    ('4-stars', '실수 없이 깨면 별 3개', '하트 3개, 신중하게'),
    ('5-home', '별자리를 완성하세요', '30레벨마다 별자리 하나'),
    ('6-skins', '네온 스킨 6종', '별가루로 열어요 · 광고 없음'),
]
os.makedirs(OUT, exist_ok=True)
f1 = ImageFont.truetype(FONT, 100, index=8)
f2 = ImageFont.truetype(FONT, 56, index=6)
for name, head, sub in CAPS:
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        continue
    bg = Image.new('RGB', (W, H), (11, 16, 38))
    # Soft vertical glow behind everything.
    g = Image.new('RGB', (W, H))
    gd = ImageDraw.Draw(g)
    for y in range(H):
        t = y / H
        gd.line([(0, y), (W, y)], fill=(int(18 + 30 * t), int(20 + 4 * t), int(58 + 30 * t)))
    bg = g
    d = ImageDraw.Draw(bg)
    for text, font, y, col in ((head, f1, 170, (255, 255, 255)), (sub, f2, 330, (76, 201, 240))):
        w = d.textlength(text, font=font)
        d.text(((W - w) / 2, y), text, font=font, fill=col)
    shot = Image.open(src).convert('RGB')
    sw = int(W * 0.8)
    sh = int(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    x, y = (W - sw) // 2, 500
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).rounded_rectangle((x - 10, y - 10, x + sw + 10, y + sh + 10), 90, fill=180)
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    bg.paste(Image.new('RGB', (W, H), (76, 201, 240)), (0, 0), glow.point(lambda v: v // 3))
    mask = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), 80, fill=255)
    bg.paste(shot, (x, y), mask)
    bg.save(os.path.join(OUT, f'ios67-{name}.png'), optimize=True)
    print('wrote', name)
