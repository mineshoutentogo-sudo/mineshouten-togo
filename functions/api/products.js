/**
 * GET /api/products
 * كتالوج المنتجات الحالي (id/name/price/weight) — عام، بدون تسجيل دخول، للاستخدام
 * من الموقع الرئيسي (index.html) عشان تعكس صفحة العرض والسلة السعر الفعلي المحدَّث
 * من لوحة الإدارة فورًا. نفس بيانات المنتجات المعروضة أصلاً على الصفحة، فقط ديناميكية.
 */
import { getProducts } from '../_lib/helpers.js';

export async function onRequestGet(context) {
  const { env } = context;
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  const products = await getProducts(env);
  const list = Object.keys(products).map((id) => ({ id, name: products[id].name, price: products[id].price, weight: products[id].weight }));
  return new Response(JSON.stringify({ products: list }), { headers });
}
