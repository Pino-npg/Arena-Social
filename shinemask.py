from PIL import Image, ImageDraw
import math, random

# === PARAMETRI ===
W, H = 512, 512
frames = 200
fps = 25
sparkle_on = fps * 1      # 1 secondo acceso
sparkle_off_min = fps * 2 # 2 secondi spento
sparkle_off_max = fps * 3 # fino a 3 secondi spento
num_sparkles = 20          # quante stelline nella mask
background_path = "Arena.png"
mask_path = "Arenamask.png"

# Carica immagini
bg = Image.open(background_path).convert("RGBA").resize((W,H))
mask = Image.open(mask_path).convert("L").resize((W,H))

# Prendi tutti i pixel bianchi della maschera
mask_pixels = [(x,y) for y in range(H) for x in range(W) if mask.getpixel((x,y)) > 200]

# Scegli punti random dentro la mask
sparkle_points = random.sample(mask_pixels, min(num_sparkles, len(mask_pixels)))

# Ogni punto ha un proprio ciclo (on + off)
cycles = []
for _ in sparkle_points:
    off_time = random.randint(sparkle_off_min, sparkle_off_max)
    cycle_length = sparkle_on + off_time
    start_offset = random.randint(0, cycle_length-1)
    cycles.append((cycle_length, start_offset))

frames_list = []

for f in range(frames):
    frame = bg.copy()
    layer = Image.new("RGBA", (W,H), (0,0,0,0))
    draw = ImageDraw.Draw(layer)

    for idx, (x, y) in enumerate(sparkle_points):
        cycle_length, offset = cycles[idx]
        phase = (f + offset) % cycle_length

        if phase < sparkle_on:  # fase accesa
            t = phase / sparkle_on
            size = 5 + int(2 * math.sin(math.pi * t))   # piccolo luccichio
            alpha = int(255 * math.sin(math.pi * t))    # fade-in/out

            # disegna stellina a croce
            draw.line((x-size, y, x+size, y), fill=(255,255,255,alpha), width=1)
            draw.line((x, y-size, x, y+size), fill=(255,255,255,alpha), width=1)

    frame = Image.alpha_composite(frame, layer)
    frames_list.append(frame)

# salva WebP animato
frames_list[0].save(
    "luccichio_mask.webp",
    save_all=True,
    append_images=frames_list[1:],
    duration=int(1000/fps),
    loop=0,
    lossless=True
)

print("✅ WebP animato con luccichii brevi e pause generato!")