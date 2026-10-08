{
  "task": "Photograph the exact product from the input image on a solid yellow studio backdrop. Output is a background plate: a designer adds the headline and logo on top later, so leave the reserved areas empty.",
  "output": {
    "aspect_ratio": "1:1",
    "style": "photorealistic commercial product photography, sharp focus, high resolution"
  },
  "background": {
    "color_hex": "#FFD600",
    "fill": "one flat uniform color edge to edge, identical in every corner",
    "no": ["gradient", "vignette", "texture", "paper grain", "highlights", "reflections", "horizon line", "floor-wall seam", "props", "borders"]
  },
  "product_shadow": {
    "type": "soft contact shadow directly under the product",
    "length": "short",
    "no": "wide dark area or darkened floor region on the background"
  },
  "composition": {
    "safe_zone": {
      "description": "Place the whole product, including its shadow, inside this rectangle. Fractions of frame width and height.",
      "x_min": 0.06,
      "x_max": 0.94,
      "y_min": 0.27,
      "y_max": 0.76
    },
    "reserved_empty": {
      "top": "y from 0.00 to 0.27 — only flat #FFD600, nothing else",
      "bottom": "y from 0.76 to 1.00 — only flat #FFD600, nothing else"
    },
    "scale": "as large as the safe zone allows: fill it to the limit by width or by height, whichever is reached first, keeping original proportions",
    "alignment": "centered horizontally, centered vertically within the safe zone",
    "crop": "product fully visible, no edge cut off"
  },
  "product": {
    "source": "the input image is the only reference for the product's appearance",
    "keep_identical": ["shape", "color", "proportions", "materials", "surface details", "controls and ports", "factory logo badge", "printed markings"],
    "no": ["restyle", "recolor", "redesign", "simplify details", "add accessories"]
  },
  "lighting": {
    "type": "even diffused studio light",
    "quality": "clean, neutral white balance, no harsh specular blow-outs, no colored cast on the product"
  },
  "do_not_add": {
    "rule": "do not ADD any NEW text, lettering, logos, watermarks, captions, stickers, labels, badges or borders anywhere in the scene",
    "only_lettering_allowed": "the only lettering anywhere in the image is what is physically printed on the product itself"
  },
  "factory_badge": "The product's own factory logo badge and printed markings remain exactly as in the reference photo, sharp and clearly legible, in their original place on the product."
}
