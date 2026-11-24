import data from '../data/products.json';

export interface Product {
  name: string;
  price: number;
  image: string;
  url: string;
  shop: string;
  fetchedAt: string;
}

const products = data as Record<string, Product>;

/** 楽天APIで取得済みの商品を引く。未取得なら undefined */
export function getProduct(id: string): Product | undefined {
  return products[id];
}

export const yen = (n: number) => '¥' + n.toLocaleString('ja-JP');
