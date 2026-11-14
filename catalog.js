export const initialCatalog = {
  "categories": [
    "Necklaces",
    "Rings",
    "Earrings",
    "Bracelets"
  ],
  "products": [
    {
      "id": 1,
      "name": "The Golden Hour Necklace",
      "category": "Necklaces",
      "material": "18k yellow gold",
      "price": 425,
      "image": "/uploads/products/827a772f57e8f6b2f95b04e9de042e6c.webp",
      "tag": "BESTSELLER",
      "images": [
        "/uploads/products/827a772f57e8f6b2f95b04e9de042e6c.webp"
      ],
      "nameAr": "قلادة الساعة الذهبية",
      "materialAr": "ذهب أصفر عيار ١٨",
      "tagAr": "الأكثر مبيعًا"
    },
    {
      "id": 2,
      "name": "The Eternal Ring",
      "category": "Rings",
      "material": "18k gold · diamond detail",
      "price": 680,
      "image": "/uploads/products/b3af30b10187403a2f1fb48e500b3e0c.webp",
      "tag": "A FOREVER FAVORITE",
      "images": [
        "/uploads/products/b3af30b10187403a2f1fb48e500b3e0c.webp"
      ],
      "nameAr": "خاتم الخلود",
      "materialAr": "ذهب عيار ١٨ مع تفاصيل ألماس",
      "tagAr": "قطعة محبوبة دائمًا"
    },
    {
      "id": 3,
      "name": "Everyday Golden Hoops",
      "category": "Earrings",
      "material": "18k yellow gold",
      "price": 295,
      "image": "/uploads/products/ce27a04c5fb93896705eed55f79a678b.webp",
      "tag": "BESTSELLER",
      "images": [
        "/uploads/products/ce27a04c5fb93896705eed55f79a678b.webp"
      ],
      "nameAr": "أقراط ذهبية لكل يوم",
      "materialAr": "ذهب أصفر عيار ١٨",
      "tagAr": "الأكثر مبيعًا"
    },
    {
      "id": 4,
      "name": "The Golden Link Bracelet",
      "category": "Bracelets",
      "material": "18k yellow gold",
      "price": 540,
      "image": "/uploads/products/fde9aeb56bb5235dc44a82018c141e3e.webp",
      "tag": "NEW CHAPTER",
      "images": [
        "/uploads/products/fde9aeb56bb5235dc44a82018c141e3e.webp"
      ],
      "nameAr": "سوار الروابط الذهبية",
      "materialAr": "ذهب أصفر عيار ١٨",
      "tagAr": "بداية جديدة"
    }
  ],
  "categoryTranslations": {
    "Necklaces": "القلائد",
    "Rings": "الخواتم",
    "Earrings": "الأقراط",
    "Bracelets": "الأساور"
  }
};
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const imageURL = value => value.startsWith('photo-') ? `https://images.unsplash.com/${value}?auto=format&fit=crop&w=700&q=85` : value;
