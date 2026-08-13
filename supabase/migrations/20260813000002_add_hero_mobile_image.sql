/*
# Add hero_background_image_mobile to site_settings

Adds a second hero image setting for mobile/small screens.
The desktop image ('hero_background_image') is shown on md+ screens.
The mobile image ('hero_background_image_mobile') is shown on sm and below.
If no mobile image is set, the desktop image is used as fallback.
*/

INSERT INTO site_settings (key, value, label, description)
VALUES
  (
    'hero_background_image_mobile',
    NULL,
    'Hero Background Image (Mobile)',
    'Background image URL for the hero banner on mobile/small screens (recommended 750x1000px, portrait). Falls back to desktop image if not set.'
  )
ON CONFLICT (key) DO NOTHING;
