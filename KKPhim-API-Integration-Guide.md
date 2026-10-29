# Hướng dẫn tích hợp KKPhim API vào Web xem phim

Tài liệu + Prompt dùng cho Agent (Cursor / Claude / GPT / …) để tích hợp API `https://phimapi.com` vào web tĩnh hiện tại.

---

## 1. Bối cảnh web hiện tại

- Web tĩnh, **đã có player phát được link m3u8**.
- **Chưa có** tính năng tìm kiếm → cần **bổ sung search**.
- Có khoảng **~10 catalog / section phim** → cần **tổ chức lại thành 3 mục chính**:
  - **Yêu thích** (favorites)
  - **Mới** (mới cập nhật)
  - **Trending** (đang thịnh hành / nổi bật)
- Mục tiêu: lấy data từ KKPhim API, map vào UI, khi chọn tập → đưa `link_m3u8` vào player sẵn có.

---

## 2. Thông tin API (đã verify)

| Mục | Giá trị |
|-----|---------|
| Base URL | `https://phimapi.com` |
| Method | GET |
| Format | JSON, UTF-8 |
| Auth | Không cần API key |
| Ảnh | `poster_url`, `thumb_url` (full URL, domain `phimimg.com`) |
| Player chính thức | `https://player.phimapi.com` |

### Endpoint chính

| Mục đích | Endpoint |
|----------|----------|
| Trang chủ / phim mới | `GET /v1/api/home` |
| Phim mới cập nhật | `GET /v1/api/danh-sach/phim-moi-cap-nhat?page=1` |
| Danh sách theo type | `GET /v1/api/danh-sach/{type}` |
| **Tìm kiếm** | `GET /v1/api/tim-kiem?keyword={kw}&limit=20` |
| Chi tiết + danh sách tập | `GET /phim/{slug}` |
| Thể loại | `GET /the-loai` |
| Quốc gia | `GET /quoc-gia` |

### Response chi tiết phim (cấu trúc quan trọng)

```json
{
  "status": true,
  "movie": {
    "name": "Xóm Nhỏ",
    "slug": "xom-nho",
    "type": "series",
    "status": "ongoing",
    "year": 2026,
    "quality": "FHD",
    "lang": "Vietsub",
    "episode_current": "Tập 6",
    "episode_total": 35,
    "poster_url": "https://phimimg.com/uploads/movies/...",
    "thumb_url": "https://phimimg.com/uploads/movies/...",
    "content": "<p>...</p>",
    "actor": [],
    "category": [],
    "country": []
  },
  "episodes": [
    {
      "server_name": "Vietsub",
      "server_data": [
        {
          "name": "Tập 01",
          "slug": "tap-01",
          "filename": "...",
          "link_embed": "https://player.phimapi.com/player/?url=...",
          "link_m3u8": "https://a.kvp726.com/.../index.m3u8"
        }
      ]
    }
  ]
}
```

### Mapping dữ liệu

| Field API | Dùng cho |
|-----------|----------|
| `movie.name` | Tiêu đề |
| `movie.slug` | ID / URL nội bộ |
| `movie.poster_url` | Poster |
| `movie.thumb_url` | Thumbnail list |
| `movie.content` | Mô tả (HTML) |
| `movie.quality` / `lang` / `year` | Badge |
| `movie.episode_current` / `episode_total` | Trạng thái tập |
| `episodes[].server_name` | Tên server (Vietsub, Thuyết minh…) |
| `episodes[].server_data[].name` | Tên tập |
| `episodes[].server_data[].link_m3u8` | **Nguồn phát video** |

### Lưu ý kỹ thuật bắt buộc

1. **CDN m3u8 geo-block ngoài VN** (`a.kvp726.com` …). User ngoài VN sẽ 404.
2. **Không proxy m3u8** qua server nước ngoài. Để browser user gọi thẳng `link_m3u8`.
3. Ưu tiên `link_m3u8` → đưa vào player hiện có. `link_embed` chỉ fallback.
4. Search: **URL-encode** `keyword`.
5. CORS: API public; nếu domain bị chặn CORS thì proxy **chỉ metadata**, không proxy stream.
6. Không spam API; có thể cache list ngắn hạn nếu cần.

---

## 3. Cách tổ chức 3 mục: Yêu thích / Mới / Trending

Web đang có ~10 catalog rời. Agent cần gom / map thành 3 section rõ ràng.

### Đề xuất nguồn data

| Mục | Nguồn API gợi ý | Ghi chú |
|-----|-----------------|---------|
| **Mới** | `/v1/api/home` hoặc `/v1/api/danh-sach/phim-moi-cap-nhat?page=1` | Phim mới cập nhật |
| **Trending** | `/v1/api/home` (phần nổi bật) hoặc danh sách có view cao / phim hot nếu API có | Nếu API không có “trending” riêng → lấy từ home hoặc phim mới, gắn label “Trending” |
| **Yêu thích** | **LocalStorage** (client-side) | User bấm “thêm yêu thích” → lưu `slug` (+ meta nhẹ: name, poster). Khi mở mục Yêu thích → fetch `/phim/{slug}` hoặc chỉ hiện list đã lưu |

### Hành vi Yêu thích (bắt buộc implement)

- Nút **♥ / Thêm yêu thích** trên card hoặc trang chi tiết.
- Lưu vào `localStorage` key ví dụ: `kkphim_favorites` = JSON array `{ slug, name, poster_url, year?, addedAt }`.
- Mục **Yêu thích** đọc từ localStorage, render list; empty state khi chưa có phim.
- Có thể bỏ yêu thích (xóa khỏi mảng + cập nhật UI).

### UI gợi ý

- Tab hoặc section ngang: **Yêu thích | Mới | Trending**.
- Mỗi section: grid/card giống catalog hiện có.
- Click card → trang / panel chi tiết → chọn server + tập → play m3u8.

---

## 4. Tính năng Search (bổ sung mới)

### Endpoint

```
GET https://phimapi.com/v1/api/tim-kiem?keyword={từ khóa}&limit=20
```

### Hành vi

1. Ô input search (header hoặc trang riêng).
2. Submit / debounce 300–500ms khi gõ (tùy UX).
3. Gọi API với `encodeURIComponent(keyword)`.
4. Render kết quả dạng grid card (name, poster, year, quality…).
5. Empty state: “Không tìm thấy phim”.
6. Click kết quả → chi tiết + play như flow bình thường.
7. Không bắt buộc filter nâng cao (thể loại/quốc gia) trong phase 1; có thể thêm sau.

### Response search (dạng rút gọn)

`data.items[]` chứa các object phim (name, slug, poster_url / thumb_url, year, quality, …) — map giống list thông thường.

---

## 5. Luồng tích hợp chuẩn

```
[Trang chủ]
  ├── Section Yêu thích  ← localStorage
  ├── Section Mới        ← /v1/api/home hoặc /danh-sach/phim-moi-cap-nhat
  └── Section Trending   ← home / list hot

[Search]
  └── /v1/api/tim-kiem?keyword=...

[Click phim]
  └── GET /phim/{slug}
        ├── Hiển thị movie info
        ├── Tabs server (episodes[].server_name)
        └── List tập → chọn tập
              └── player.play(episode.link_m3u8)
```

---

## 6. Prompt đưa cho Agent

Copy toàn bộ khối dưới đây và dán cho agent. Điền phần `[ĐIỀN THÊM]` cho sát project.

```text
Bạn là senior frontend engineer. Nhiệm vụ: tích hợp API KKPhim (https://phimapi.com) vào web tĩnh hiện tại của tôi.

### Bối cảnh web
- Web tĩnh, ĐÃ CÓ player phát được link m3u8 — KHÔNG viết player mới, chỉ truyền link_m3u8 vào player hiện có.
- Chưa có tìm kiếm → PHẢI bổ sung tính năng Search.
- Hiện có khoảng ~10 catalog/section phim rời → tổ chức lại thành 3 mục chính:
  1. Yêu thích (favorites) — lưu client-side bằng localStorage
  2. Mới — lấy từ API phim mới cập nhật
  3. Trending — lấy từ API (home / list nổi bật); nếu không có endpoint trending riêng thì dùng data home/mới và gắn label Trending

### Mục tiêu cụ thể
1. Module API gọi phimapi.com (home, danh-sách mới, search, chi tiết /phim/{slug}).
2. UI 3 mục: Yêu thích | Mới | Trending (tab hoặc section).
3. Yêu thích: nút thêm/xóa, lưu localStorage (slug, name, poster_url, …), render list + empty state.
4. Search: ô tìm kiếm → GET /v1/api/tim-kiem?keyword=...&limit=20 → grid kết quả → click vào chi tiết.
5. Trang/panel chi tiết: info phim + server tabs + list tập; chọn tập → đưa link_m3u8 vào player hiện có.
6. Giữ nguyên UI/UX và cấu trúc file tối đa; chỉ thêm data layer + binding + search + favorites.

### API (đã verify)
- Base: https://phimapi.com — GET, JSON, không API key
- Home: GET /v1/api/home
- Mới: GET /v1/api/danh-sach/phim-moi-cap-nhat?page=1
- Search: GET /v1/api/tim-kiem?keyword={kw}&limit=20
- Chi tiết + tập: GET /phim/{slug}
- Response chi tiết có movie + episodes[].server_name + server_data[].{ name, slug, link_m3u8, link_embed }

### Quy tắc bắt buộc
- Dùng link_m3u8 làm nguồn phát chính; link_embed chỉ fallback.
- CDN m3u8 geo-block ngoài VN → KHÔNG proxy m3u8 qua server nước ngoài.
- URL-encode keyword khi search.
- Xử lý loading / empty / error rõ ràng.
- Ảnh dùng poster_url / thumb_url (full URL).
- Không hardcode data giả; mọi list/detail từ API (trừ Yêu thích đọc localStorage).
- Không thêm dependency nặng nếu không cần.

### Cách làm việc
1. Đọc cấu trúc project (HTML/JS/CSS, cách player nhận m3u8, file list/detail).
2. Chỉ ra file sẽ tạo/sửa trước khi code.
3. Tạo module API nhỏ (ví dụ js/kkphim-api.js).
4. Implement 3 section + favorites (localStorage) + search.
5. Bind chọn tập → gọi hàm play của player hiện tại với link_m3u8.
6. Sau khi xong: tóm tắt file đã đụng, cách test, endpoint đã dùng.

### [ĐIỀN THÊM – thông tin web của tôi]
- Stack: [HTML+JS thuần / Vue / React / …]
- Cách player nhận m3u8: [ví dụ: playM3u8(url) / video.src = url / hls.loadSource(url) / …]
- File trang list / trang xem chính: [đường dẫn]
- Có router không, URL dạng nào: [/watch?slug= / hash / …]
- Ưu tiên phase 1: [3 mục + search + detail + play]
```

---

## 7. Checklist sau khi Agent xong

- [ ] Section **Mới** load được từ API
- [ ] Section **Trending** có data (hoặc map từ home)
- [ ] **Yêu thích**: thêm / xóa / persist localStorage / empty state
- [ ] **Search** hoạt động, encode đúng, empty state
- [ ] Chi tiết phim: info + server + list tập
- [ ] Chọn tập → player phát đúng `link_m3u8`
- [ ] Loading / lỗi API được xử lý
- [ ] Không proxy stream m3u8 qua server nước ngoài

---

## 8. Test nhanh API (tham khảo)

```bash
# Home
curl -s "https://phimapi.com/v1/api/home" | head -c 500

# Phim mới
curl -s "https://phimapi.com/v1/api/danh-sach/phim-moi-cap-nhat?page=1" | head -c 500

# Search
curl -s "https://phimapi.com/v1/api/tim-kiem?keyword=one%20piece&limit=5" | head -c 500

# Chi tiết + m3u8
curl -s "https://phimapi.com/phim/xom-nho" | head -c 800
```

---

## 9. Ghi chú pháp lý / vận hành

API và nội dung do bên thứ ba tổng hợp. Chỉ dùng cho mục đích tích hợp kỹ thuật. CDN stream có thể thay đổi domain hoặc chặn theo khu vực; luôn lấy `link_m3u8` mới từ API thay vì hardcode URL stream.

---

*Tài liệu phục vụ tích hợp web tĩnh + player m3u8 sẵn có. Cập nhật theo Base URL / endpoint nếu KKPhim thay đổi.*
