# True Color Window Inverter

**This is a fork of ~~JackKenney~~ GabePoel~~/true-color-window-invert**

**Gnome 46**
Now working for GNOME 46!

GNOME shell extension for inverting window colors in hue preserving manner. Effectively a manual dark theme for GNOME windows.

Available on the GNOME Extensions website here:

~~https://extensions.gnome.org/extension/5829/true-color-invert/~~

## Supported Versions

- Gnome 46 (tested on Fedora Workstation 40)

Deprecated versions will not be supported nor will they recieve any further updates.

## Keyboard Shortcut

`Super + I`

## Installing

1. Clone the repo into (or symlink into): `~/.local/share/gnome-shell/extensions/true-color-window-invert@dra11y`

2. Logout with:
```
killall -3 gnome-shell
```

3. Enable extension:
```
gnome-extensions enable true-color-window-invert@dra11y
```

## Debugging

Errors are written to the journal log:
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

## Contributing

Before submitting pull requests, please run:

```bash
glib-compile-schemas schemas/
```

To recompile the `gschemas`.
This step is not neccesary if the 'build.sh' is used, as it's included in the script

## Building for Release

To make the ZIP for the GNOME Shell Extension website: 

1. `sh build.sh`
2. Tag `main` at that time with a release tag according to the revisions made.
