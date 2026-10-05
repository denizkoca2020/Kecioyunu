# Keçi Oyunu

iPad için 3B sonsuz koşu oyunu. Keçi köyde serbestçe koşar; onu istediğin yöne sürüp önüne çıkana toslarsın.

## Kontroller

| iPad | Klavye | Hareket |
|---|---|---|
| Sol yarıda sanal joystick | Ok tuşları / WASD | Sağa sola dön, ileri it: hızlan, geri çek: yavaşla |
| **TOS** tuşu (ya da sağ yarıya dokun) | `J` / `X` / `Enter` | Başını eğip ileri atıl |
| **ZIPLA** tuşu | `Boşluk` | Zıpla (havada bir kez daha: çift zıplama) |
| ❚❚ | `Esc` / `P` | Duraklat |

## Kurallar

- **Köylü** 10, **turist** 15, **bekçi** 30 puan. Bekçiye iki kez toslamak gerekir.
- Art arda toslamalar kombo yapar (x5'e kadar). Uçan biri başkasına çarparsa o da uçar (zincir).
- Köylüler kaçar, turistler fotoğraf çeker, **bekçiler kovalar**. Bekçi dokunursa 1 can gider.
- **Taşa** ve **çite** çarpmak da 1 can götürür. Üstlerinden zıpla. Evler, ağaçlar ve saman yığınları yolu keser.
- **Enerji** koştukça azalır. Toslamak ve **ot** yemek doldurur. **Kırmızı elma** 1 can verir.
- Can ya da enerji biterse oyun biter. Sağ üstteki mini harita insanları (mavi köylü, turuncu turist, lacivert bekçi) ve otları gösterir.

## Teknik

- Tek sayfa: `index.html`. 3B motor olarak [three.js](https://threejs.org) r128 kullanılır (`vendor/three.min.js`, MIT lisansı).
- Tüm modeller kodla, basit geometrilerden kurulur. Dışarıdan görsel ya da ses dosyası yoktur. Sesler Web Audio ile üretilir.
- Dünya 30 m'lik parçalardan oluşur ve keçi ilerledikçe sonsuza kadar üretilir.
- Rekor ve ses ayarı cihazda (`localStorage`) saklanır.

## iPad'de çalıştırma

1. Depoyu bir web adresinde yayınla (ör. GitHub Pages: Settings → Pages → dalı seç).
2. iPad'de Safari ile aç.
3. Paylaş → **Ana Ekrana Ekle**. Keçi simgesiyle, tam ekran bir uygulama gibi açılır.

Yatay tutuşta oynanması önerilir.
