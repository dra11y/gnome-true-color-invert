import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GObject      from 'gi://GObject'
import Meta      from 'gi://Meta'
import Shell from 'gi://Shell';
import Clutter      from 'gi://Clutter'

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'

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
    enable() {
        let extensionSettings = this.getSettings();
        this._toggleEffect = this._toggleEffect.bind(this);
        Main.wm.addKeybinding(
            'invert-window-shortcut',
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            this._toggleEffect
        );
    }

    disable() {
        Main.wm.removeKeybinding('invert-window-shortcut');
        this._removeEffectFromAllWindows();
    }

    _toggleEffect() {
        global.get_window_actors().forEach((actor) => {
            let meta_window = actor.meta_window;
            if (meta_window.has_focus()) {
                if (actor.get_effect('invert-color')) {
                    actor.remove_effect_by_name('invert-color');
                } else {
                    let effect = new TrueInvertWindowEffect();
                    actor.add_effect_with_name('invert-color', effect);
                }
            }
        });
    }

    _removeEffectFromAllWindows() {
        global.get_window_actors().forEach((actor) => {
            actor.remove_effect_by_name('invert-color');
        });
    }
}
