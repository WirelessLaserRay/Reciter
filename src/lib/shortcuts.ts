/**
 * 数字键 1-N 映射到选项索引（0-based）。
 * 非数字、超出范围、选项数为 0 时返回 null。
 */
export function optionIndexFromNumberKey(key: string, optionCount: number): number | null {
  if (optionCount <= 0) return null;
  const n = Number(key);
  if (!Number.isInteger(n) || n < 1 || n > optionCount) return null;
  return n - 1;
}
