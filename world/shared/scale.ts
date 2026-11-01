/** Authored tree envelope, shared by the garden recipe and module admission. */
export const GARDEN_TREE=Object.freeze({largestSize:2.1,crownCenter:2.25,crownCenterJitter:.3,crownY:.45,crownYJitter:.2});
export const TALLEST_TREE_HEIGHT=GARDEN_TREE.largestSize*(GARDEN_TREE.crownCenter+GARDEN_TREE.crownCenterJitter+GARDEN_TREE.crownY+GARDEN_TREE.crownYJitter);
export function scaleVerdict(height:number){return Number.isFinite(height)&&height<=TALLEST_TREE_HEIGHT?undefined:`Module world-space height ${height.toFixed(2)} exceeds the tallest tree envelope (${TALLEST_TREE_HEIGHT.toFixed(2)} world units). Keep props small; achieve readability with count, contrast and motion.`;}
