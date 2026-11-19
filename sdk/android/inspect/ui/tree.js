import Java from 'frida-java-bridge';
import { runOnMainThread } from '../../common/main-thread.js';
import { resolveView } from '../../element/target.js';
import { localBounds } from './layout.js';

export async function tree(target, depth = 3) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 64) {
    throw new TypeError('tree depth must be an integer from 0 to 64');
  }
  return runOnMainThread(() => {
    const Group = Java.use('android.view.ViewGroup');
    function visit(view, level) {
      const wrapper = Java.cast(view, Java.use(view.$className));
      const node = { className: wrapper.$className, target: wrapper, bounds: localBounds(wrapper), children: [] };
      if (level < depth && Group.class.isInstance(view)) {
        const group = Java.cast(view, Group);
        for (let i = 0; i < group.getChildCount(); i++) node.children.push(visit(group.getChildAt(i), level + 1));
      }
      return node;
    }
    const view = resolveView(target);
    if (view === null) throw new Error('UI target was not found');
    return visit(view, 0);
  });
}
