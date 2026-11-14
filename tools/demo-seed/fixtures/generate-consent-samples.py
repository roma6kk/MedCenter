#!/usr/bin/env python3
"""Regenerates the sample consent scans the demo seed attaches to demo consents.

Run: python3 tools/demo-seed/fixtures/generate-consent-samples.py
Needs Pillow and Noto Sans (Cyrillic). Everything on the page is fictitious.
The output is a one-page raster "scan" with a diagonal watermark; it is not the official form.
"""
from pathlib import Path
import io

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path('/usr/share/fonts/truetype/noto')
OUT_DIR = Path(__file__).resolve().parent
W, H = 910, 1287
DPI = 110

CLINIC = 'Лайфлайн (учебный проект)'
WORKER = 'Иванова Мария Сергеевна, врач-терапевт'
DATE = 'дата подписания: ____.____.________ (вымышленная)'
WATERMARK = 'ОБРАЗЕЦ — вымышленные данные'

PATIENTS = {
    'kuznetsov': ('Кузнецов Павел', '14.03.1985'),
    'lebedeva': ('Лебедева Анна', '02.11.1992'),
    'novikov': ('Новиков Сергей', '21.07.1978'),
}

BODY = [
    'Я, {name}, дата рождения {birth}, подтверждаю, что до внесения',
    'сведений о состоянии моего здоровья в информационную систему',
    'организации здравоохранения мне разъяснены цели и состав сведений,',
    'порядок доступа к ним и право отозвать настоящее согласие.',
    '',
    'Даю согласие на внесение сведений о состоянии моего здоровья,',
    'диагнозе, результатах обследования и лечения в информационную',
    'систему организации здравоохранения «' + CLINIC + '»',
    '(статья 44, часть 13 Закона Республики Беларусь «О здравоохранении»).',
    '',
    'Согласие может быть отозвано письменным заявлением. Отзыв не влияет',
    'на законность обработки сведений до его получения.',
]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def page(name: str, birth: str) -> Image.Image:
    img = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(img)
    d.text((W // 2, 90), 'СОГЛАСИЕ ПАЦИЕНТА', font=font('NotoSans-Bold.ttf', 30), fill=20, anchor='mm')
    d.text((W // 2, 135), 'на внесение сведений в информационную систему клиники', font=font('NotoSans-Regular.ttf', 20), fill=40, anchor='mm')
    d.text((W // 2, 168), 'Форма составлена в произвольном виде и не является официальной формой', font=font('NotoSans-Regular.ttf', 15), fill=90, anchor='mm')
    body_font = font('NotoSans-Regular.ttf', 19)
    y = 250
    for line in BODY:
        d.text((70, y), line.format(name=name, birth=birth), font=body_font, fill=25)
        y += 38
    y += 60
    small = font('NotoSans-Regular.ttf', 17)
    d.line((70, y + 40, 400, y + 40), fill=60, width=2)
    d.text((70, y + 48), f'Подпись пациента: {name}', font=small, fill=50)
    d.line((70, y + 150, 400, y + 150), fill=60, width=2)
    d.text((70, y + 158), f'Медицинский работник: {WORKER}', font=small, fill=50)
    d.text((70, y + 210), DATE, font=small, fill=50)
    d.text((70, y + 250), f'Организация: {CLINIC}', font=small, fill=50)
    # a fictitious scribble in place of a signature
    d.line([(110, y + 30), (150, y - 5), (190, y + 32), (235, y - 8), (300, y + 28)], fill=70, width=2)
    d.line([(110, y + 140), (170, y + 105), (210, y + 138), (330, y + 118)], fill=70, width=2)

    mark = Image.new('L', (W * 2, 220), 0)
    ImageDraw.Draw(mark).text((W, 110), WATERMARK, font=font('NotoSans-Bold.ttf', 54), fill=255, anchor='mm')
    mark = mark.rotate(38, expand=True, resample=Image.BICUBIC)
    layer = Image.new('L', mark.size, 150)
    px = (W - mark.width) // 2
    py = (H - mark.height) // 2
    img.paste(layer, (px, py), mark.point(lambda v: int(v * 0.55)))
    return img


def main() -> None:
    for key, (name, birth) in PATIENTS.items():
        buffer = io.BytesIO()
        page(name, birth).save(buffer, 'PDF', resolution=DPI, quality=45, optimize=True,
                               title='Образец согласия (вымышленные данные)', producer='', author='')
        data = buffer.getvalue()
        (OUT_DIR / f'consent-sample-{key}.pdf').write_bytes(data)
        print(key, len(data))


if __name__ == '__main__':
    main()
