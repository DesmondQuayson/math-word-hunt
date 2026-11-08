export interface ProductView {
  readonly avatar: Readonly<Record<string, unknown>>;
  readonly show: readonly string[];
  readonly frameOn: readonly string[];
  readonly yaw: number;
  readonly pitch: number;
  readonly fill: number;
  readonly shadow: number;
}

export function productView(item: { readonly id: string; readonly slot: string; readonly model?: string }): ProductView;
export function framingForSlot(slot: string): "full" | "upper" | "face" | "legs" | "feet";
