# cats/

One folder per cat. Drop cutout PNGs in, then pick **Reload cats** from the
tray icon.

    cats/
      mochi/
        sit.png
        walk-left.png
        sleep-right.png

The filename is the pose. Add `-left`, `-right` or `-front` to say which way
your cat faces in that photo — without it the app assumes right, and a
left-facing cat appears to walk backwards.

One photo is enough: a folder containing only `sit.png` gives a working cat.

Sizes are worked out automatically. Add a `cat.json` only if you want to change
the cat's height, speed or how many of it there are — see the main README.

Once installed, this folder lives at `%APPDATA%\Windowsill\cats` instead.
