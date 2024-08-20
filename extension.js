import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject'
import Meta from 'gi://Meta'
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter'

import { WindowPreview } from 'resource:///org/gnome/shell/ui/windowPreview.js'
import { WorkspaceThumbnail } from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js'
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'

import { connections } from './utils/connections.js'
import { logger } from './utils/logger.js'
import { LinFilterEffect } from './effect/lin_filter_effect.js'

const TrueInvertWindowEffect = new GObject.registerClass({
    Name: 'TrueInvertWindowEffect',
}, class TrueInvertWindowEffect extends Clutter.ShaderEffect {
    vfunc_get_static_shader_source() {
        return `
			uniform bool invert_color;
			uniform float opacity = 1.0;
			uniform sampler2D tex;

			/**
			 * based on shift_whitish.glsl https://github.com/vn971/linux-color-inversion with minor edits
			 */
			void main() {
				vec4 c = texture2D(tex, cogl_tex_coord_in[0].st);

				float white_bias = c.a * 0.1; // lower -> higher contrast
				float m = 1.0 + white_bias;
				
				float shift = white_bias + c.a - min(c.r, min(c.g, c.b)) - max(c.r, max(c.g, c.b));
				
				c = vec4((shift + c.r) / m, 
						(shift + c.g) / m, 
						(shift + c.b) / m, 
						c.a);

				cogl_color_out = c;
			}
		`;
    }

    vfunc_paint_target(paint_node = null, paint_context = null) {
        this.set_uniform_value("tex", 0);

        if (paint_node && paint_context)
            super.vfunc_paint_target(paint_node, paint_context);
        else if (paint_node)
            super.vfunc_paint_target(paint_node);
        else
            super.vfunc_paint_target();
    }
});

export default class TrueColorWindowInvert extends Extension {
    constructor() {
        super(...arguments);
        this.windowClones = new Map();
        this.windowPreviews = new Map();
    }

    enable() {
        logger('Extension enabled');
        this._settings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
        this._toggleEffect = this._toggleEffect.bind(this);
        let extensionSettings = this.getSettings();

        Main.wm.addKeybinding(
            'invert-window-shortcut',
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            this._toggleEffect
        );

        this._connectThemeChangeSignal();
        this._connectWindowCreatedSignal();

        // The original methods are patched to add color inversion to window previews
        this._orig_add_window = WindowPreview.prototype._addWindow
        this._orig_add_window_clone = WorkspaceThumbnail.prototype._addWindowClone

        const self = this

        WindowPreview.prototype._addWindow = function (window) {
            // call original method from gnome-shell
            self._orig_add_window.apply(this, [window])

            // If the window doesn't have its color inverted, just return.
            const actor = window.get_compositor_private()
            if (!actor.get_effect('invert-color')) {
                return
            }

            logger(`Update colors for ${window.title} in overview`)

            // WindowPreview.window_container used to show content of window
            const window_container = this.window_container
            let first_child = window_container.first_child

            // Disable color inversion temporarily when entering overview
            let invert_effect_of_window_actor = actor.get_effect('invert-color')
            invert_effect_of_window_actor?.set_enabled(false)

            // Add color inversion to preview window actor
            first_child?.add_effect_with_name('lin-filt', new LinFilterEffect())
            first_child?.add_effect_with_name('invert-color', new TrueInvertWindowEffect())

            self.windowPreviews.set(window, first_child)

            // Enable color inversion when leaving overview
            const c = connections.get()
            c.connect(this, 'destroy', () => {
                first_child?.remove_effect_by_name('invert-color');
                first_child = null

                if (Main.overview._overview.controls._workspacesDisplay._leavingOverview) {
                    invert_effect_of_window_actor?.set_enabled(true)
                }

                c.disconnect_all(this)
            })
        }

        WorkspaceThumbnail.prototype._addWindowClone = function (window) {

            let clone = self._orig_add_window_clone.apply(this, [window])

            let metaWin = clone.metaWindow

            let actor = metaWin.get_compositor_private()
            logger(`Checking ${metaWin.title} for color inversion`)
            if (actor.get_effect('invert-color')) {
                logger(`Inverting ${metaWin.title}`)
                clone?.add_effect_with_name('lin-filt', new LinFilterEffect())
                clone?.add_effect_with_name('invert-color', new TrueInvertWindowEffect())
            }
        }
    }

    disable() {
        // Restore patched methods
        WindowPreview.prototype._addWindow = this._orig_add_window
        WorkspaceThumbnail.prototype._addWindowClone = this._orig_add_window_clone
        logger('Extension disabled');
        Main.wm.removeKeybinding('invert-window-shortcut');
        this._removeEffectFromAllWindows();
        if (this._themeChangeSignalId) {
            this._settings.disconnect(this._themeChangeSignalId);
        }
        if (this._windowCreatedSignalId) {
            global.display.disconnect(this._windowCreatedSignalId);
        }
    }

    _connectThemeChangeSignal() {
        this._themeChangeSignalId = this._settings.connect('changed::color-scheme', () => {
            this._updateEffectBasedOnTheme();
        });

        // Initial update based on current theme
        this._updateEffectBasedOnTheme();
    }

    _connectWindowCreatedSignal() {
        this._windowCreatedSignalId = global.display.connect('window-created', (display, window) => {
            logger('Window signal detected:' + `${window.title}`);
            this._waitForWMClass(window, 50); // Retry up to 50 times
        });
    }

    _waitForWMClass(metaWindow, retries) {
        // logger('Waiting for WM_CLASS');
        if (metaWindow.get_wm_class() !== null || retries <= 0) {
            // logger('Window signal detected: ' + metaWindow.get_wm_class());
            if (metaWindow.get_wm_class() !== null) {
                this._onWindowCreated(metaWindow);
            } else {
                logger('Failed to get WM_CLASS after retries');
            }
        } else {
            // logger('Retrying to get WM_CLASS');
            // logger('Retries left: ' + retries);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                this._waitForWMClass(metaWindow, retries - 1);
                return GLib.SOURCE_REMOVE;
            });
        }
    }


    _onWindowCreated(metaWindow) {
        logger('Window created:' + metaWindow.get_wm_class());
        const isDarkMode = this._isDarkMode();
        if (isDarkMode) {
            if (this._isTargetApplication(metaWindow.get_wm_class())) {
                const actor = metaWindow.get_compositor_private();
                if (!actor.get_effect('invert-color')) {
                    let effect = new TrueInvertWindowEffect();
                    actor.add_effect_with_name('invert-color', effect);
                }
            }
        }
    }

    _isDarkMode() {
        return this._settings.get_string('color-scheme') === 'prefer-dark';
    }

    _isTargetApplication(wmClass) {
        let config = this._readConfigFile();
        if (config && config.targetApps.includes(wmClass)) {
            return true;
        }
        return false;
    }

    _updateEffectBasedOnTheme() {
        logger('Theme changed');
        const isDarkMode = this._isDarkMode();
        if (isDarkMode) {
            this._applyEffectToCertainWindows();
        } else {
            this._removeEffectFromAllWindows();
        }
    }

    _applyEffectToCertainWindows() {
        global.get_window_actors().forEach((actor) => {
            let meta_window = actor.meta_window;
            if (this._isTargetApplication(meta_window.get_wm_class())) {
                if (!actor.get_effect('invert-color')) {
                    let effect = new TrueInvertWindowEffect();
                    actor.add_effect_with_name('invert-color', effect);
                }
            }
        });
    }

    _toggleEffect() {
        global.get_window_actors().forEach((actor) => {
            let meta_window = actor.meta_window;
            if (meta_window.has_focus()) {
                if (actor.get_effect('invert-color')) {
                    this._removeEffectFromWindow(meta_window);
                } else {
                    let effect = new TrueInvertWindowEffect();
                    actor.add_effect_with_name('invert-color', effect);
                }
            }
        });
    }

    _removeEffectFromWindow(window) {
        let actor = window.get_compositor_private();
        actor.remove_effect_by_name('invert-color');
        if (this.windowPreviews.has(window)) {
            let preview = this.windowPreviews.get(window);
            preview.remove_effect_by_name('invert-color');
        }
        if (this.windowClones.has(window)) {
            let clone = this.windowClones.get(window);
            clone.remove_effect_by_name('invert-color');
        }
    }

    _removeEffectFromAllWindows() {
        global.get_window_actors().forEach((actor) => {
            // actor.remove_effect_by_name('invert-color');
            let window = actor.meta_window;
            this._removeEffectFromWindow(window);
        });
    }

    _readConfigFile() {
        let file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), '.config', 'true-color-window-invert', 'config.json']));

        try {
            let [success, jsonString] = file.load_contents(null);
            if (success) {
                let config = JSON.parse(jsonString);
                return config;
            }
        } catch (e) {
            logger(`Error reading configuration file: ${e}`);
        }
        return null; // Return null or a default configuration if the file cannot be read
    }
}
