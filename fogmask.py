from PIL import Image, ImageDraw, ImageFilter
import random, math

# Parametri
frames = 100
dew_count = 600
glow_color_base = (210, 25, 25)  # RGB glow
output_webp = "Home.webp"

# File
sig_file = "Home.png"
smoke_mask_file = "Homemask.png"
glow_mask_file = "Homered.png"

# Carica immagini
sig_layer = Image.open(sig_file).convert("RGBA")
smoke_mask = Image.open(smoke_mask_file).convert("L")
glow_mask = Image.open(glow_mask_file).convert("L")
W, H = sig_layer.size

# Pixel validi per fumo
valid_pixels = [(x,y) for x in range(W) for y in range(H) if smoke_mask.getpixel((x,y)) > 128]

# Posizioni iniziali particelle
particles = []
for _ in range(dew_count):
    x, y = random.choice(valid_pixels)
    speed = random.uniform(0.5, 1.5)
    drift = random.uniform(-0.4, 0.4)
    particles.append([x, y, speed, drift])

# Lista frame
frames_list = []

for f in range(frames):
    frame = sig_layer.copy()

    # Layer fumo
    fumo_layer = Image.new("RGBA", (W,H), (0,0,0,0))
    draw = ImageDraw.Draw(fumo_layer)
    for p in particles:
        x, y, speed, drift = p
        size = random.randint(6,8)
        alpha = 150  # trasparenza fumo
        draw.ellipse((x, y, x+size, y+size), fill=(239,234,234,alpha))
        # Aggiorna posizione
        y -= speed
        x += drift
        if (x,y) not in valid_pixels:
            x, y = random.choice(valid_pixels)
        p[0], p[1] = x, y

    fumo_layer = fumo_layer.filter(ImageFilter.GaussianBlur(1.5))
    frame.paste(fumo_layer, (0,0), fumo_layer)

    # Layer glow pulsante
    glow_layer = Image.new("RGBA", (W,H), (0,0,0,0))
    draw_glow = ImageDraw.Draw(glow_layer)
    alpha = int(120 + 60 * math.sin(2*math.pi*f/frames))
    glow_color = glow_color_base + (alpha,)
    for x in range(W):
        for y in range(H):
            if glow_mask.getpixel((x,y)) > 128:
                draw_glow.ellipse((x-1, y-1, x+1, y+1), fill=glow_color)
    frame.paste(glow_layer, (0,0), glow_layer)

    frames_list.append(frame)

# Salva direttamente in WebP animato trasparente
frames_list[0].save(
    output_webp,
    save_all=True,
    append_images=frames_list[1:],
    duration=250,    # ms per frame, più alto = più lento
    loop=0,
    disposal=2,
    transparency=0
)

print(f"✅ WebP animato generato: {output_webp}")
