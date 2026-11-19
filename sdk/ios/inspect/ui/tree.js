import { runOnMainThread } from '../../common/main-thread.js';
import { resolveView } from '../../element/target.js';
import { rect, pixels, scaleFor } from './layout.js';

export async function tree(target, depth = 3) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 64) {
    throw new TypeError('tree depth must be an integer from 0 to 64');
  }
  return runOnMainThread(() => {
    const root = resolveView(target);
    if (root === null) throw new Error('UI target was not found');
    const scale = scaleFor(root);
    function visit(view, level) {
      const node = { className: view.$className, target: view, bounds: pixels(rect(view.bounds()), scale), children: [] };
      if (level < depth) {
        const children = view.subviews();
        for (let i = 0; i < Number(children.count()); i++) node.children.push(visit(children.objectAtIndex_(i), level + 1));
      }
      return node;
    }
    return visit(root, 0);
  });
}
