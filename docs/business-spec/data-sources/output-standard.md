# Output standard: raw data in the app database

This page shows what the app database stores for each declared source. Rules and field lists: [input-standard.md](input-standard.md), [NGUON-VAO-CSDL.md](../../../data/raw-sources/NGUON-VAO-CSDL.md), [KHUON-CSDL.md](../../../data/raw-sources/KHUON-CSDL.md).

Read from the live app database, 2026-11-04. Only 3 example rows per table. Long cells are cut at 90 characters. Writer and creator columns are left out.

## Totals

| Source | What it is | Product | Calls stored | Rows |
|---|---|---|---|---|
| S05 | Shopee reviews | kẽm | 5 | 1,152 review |
| S06 | TikTok Shop reviews | vitamin c | 3 | 873 review |
| S07 | TikTok video comments | kẽm | 1 | 262 review, 5 video |
| S02b | Videos that sell the product | vitamin c | 3 | 30 video_snapshot, 30 video |
| S02b | Videos that sell the product | kẽm | 3 | 30 video_snapshot, 30 video |
| S14 | Video readings | kẽm | 3 | 3 video_reading, 110 video_segment |
| S19b | Google suggestions | vitamin c | 24 | 240 search_suggestion |
| S19b | Google suggestions | kẽm | 75 | 665 search_suggestion |
| S29 | Google AI Overview | vitamin c | 1 | 15 ai_overview_block, 10 ai_overview_reference |
| S29 | Google AI Overview | kẽm | 1 | 12 ai_overview_block, 7 ai_overview_reference |

## S05: Shopee reviews

**kẽm, table `review`** (1,152 rows)

| review_key | source_code | platform | kind | external_id | product_key | rating_star | text | variation |
|---|---|---|---|---|---|---|---|---|
| S05:12143590514 | S05 | shopee | product_review | 12143590514 | shopee:2308735412 | 5 | Đóng gói đẹp, giao hàng nhanh, sp đầy đủ, shipper thân thiện, hsd + nsx rõ ràng. Mong sẽ g… | 20 Ngày |
| S05:9963760526 | S05 | shopee | product_review | 9963760526 | shopee:2308735412 | 5 | Mk ms uống 1 túi vitamin c là thấy da đã sáng hơn 1 chút chắc là do da mk cx đã ổn sẵn r c… | 60 Ngày |
| S05:12561973023 | S05 | shopee | product_review | 12561973023 | shopee:2308735412 | 5 | shop cbi hàng và giao hàng nhanh dã man, đặt hôm trc hôm sau đã nhận đc, đóng gói chắc chắ… | 60 Ngày |

## S06: TikTok Shop reviews

**vitamin c, table `review`** (873 rows)

| review_key | source_code | platform | kind | external_id | product_key | rating_star | text | variation |
|---|---|---|---|---|---|---|---|---|
| S06:7535683457733871367 | S06 | tiktok_shop | product_review | 7535683457733871367 | tiktok_shop:1731436377798510728 | 4 |   | Mặt hàng: 2 hộp (120 viên x 50mg) |
| S06:7535655418338068242 | S06 | tiktok_shop | product_review | 7535655418338068242 | tiktok_shop:1731436377798510728 | 4 | Cũng cũng | Mặt hàng: 2 hộp (120 viên x 50mg) |
| S06:7535425975279191816 | S06 | tiktok_shop | product_review | 7535425975279191816 | tiktok_shop:1731436377798510728 | 4 |   | Mặt hàng: 2 hộp (120 viên x 50mg) |

## S07: TikTok video comments

**kẽm, table `review`** (262 rows)

| review_key | source_code | platform | kind | external_id | video_url | text | posted_at | like_count |
|---|---|---|---|---|---|---|---|---|
| S07:7646293963571774229 | S07 | tiktok | video_comment | 7646293963571774229 | https://www.tiktok.com/@imochi.vn/video/7500214221850955015 | Cho con bú uống dc k ạ | 2026-06-01T12:26:03+07:00 | 0 |
| S07:7566971764639712001 | S07 | tiktok | video_comment | 7566971764639712001 | https://www.tiktok.com/@imochi.vn/video/7500214221850955015 | Uống bao nhiêu tháng v chị? Có giới hạn lần uống ko | 2025-10-30T18:15:15+07:00 | 0 |
| S07:7643744795211645716 | S07 | tiktok | video_comment | 7643744795211645716 | https://www.tiktok.com/@imochi.vn/video/7500214221850955015 | Uống kẽm có bị lên mụn ko ạ | 2026-05-25T15:33:59+07:00 | 0 |

**kẽm, table `video`** (5 rows)

| video_url | video_id | platform | link_basis | capture_id |
|---|---|---|---|---|
| https://www.tiktok.com/@bacluongdinhduongthan/video/7644545695881366791 | 7644545695881366791 | tiktok | UNKNOWN | S07:a4a0d4d7f0da:1 |
| https://www.tiktok.com/@imochi.vn/video/7636394988934302996 | 7636394988934302996 | tiktok | UNKNOWN | S07:a4a0d4d7f0da:1 |
| https://www.tiktok.com/@bacluongdinhduongthan/video/7472367489947602194 | 7472367489947602194 | tiktok | UNKNOWN | S07:a4a0d4d7f0da:1 |

## S02b: Videos that sell the product

**vitamin c, table `video_snapshot`** (30 rows)

| capture_id | video_url | source_code | window_start | window_end | rank | title | published_at | revenue_vnd |
|---|---|---|---|---|---|---|---|---|
| S02b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:56 | https://www.tiktok.com/@anhtuyet.2311/video/7694575766670986517 | S02b | 2026-10-05 | 2026-11-03 | 1 | Xuyên không về 2026 tui dienggg cuong nhai vitamin C | 2026-10-09T15:03:54+07:00 | 402001676.11 |
| S02b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:56 | https://www.tiktok.com/@gdchanhchanh/video/7692755994258033941 | S02b | 2026-10-05 | 2026-11-03 | 4 | bí quyết của mình ❤️ #vitaminc #wonderplus | 2026-10-04T17:22:18+07:00 | 206593863.93 |
| S02b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:56 | https://www.tiktok.com/@giahuy0527/video/7694654293072219410 | S02b | 2026-10-05 | 2026-11-03 | 2 | #wonderplus #vitaminc #tiktokshop1010 #sale | 2026-10-09T20:08:40+07:00 | 284728926.02 |

**vitamin c, table `video`** (30 rows)

| video_url | video_id | platform | product_key | link_basis | capture_id |
|---|---|---|---|---|---|
| https://www.tiktok.com/@anhtuyet.2311/video/7694575766670986517 | 7694575766670986517 | tiktok | tiktok_shop:1731436377798510728 | PROVIDER_LINK | S02b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:56 |
| https://www.tiktok.com/@giahuy0527/video/7694654293072219410 | 7694654293072219410 | tiktok | tiktok_shop:1731436377798510728 | PROVIDER_LINK | S02b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:56 |
| https://www.tiktok.com/@kautzftaxg7/video/7695793058834599175 | 7695793058834599175 | tiktok | tiktok_shop:1731436377798510728 | PROVIDER_LINK | S02b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:56 |

**kẽm, table `video_snapshot`** (30 rows)

| capture_id | video_url | source_code | window_start | window_end | rank | title | published_at | revenue_vnd |
|---|---|---|---|---|---|---|---|---|
| S02b:ec675f6b6682:1 | https://www.tiktok.com/@binhvaheoshop/video/7571834567905103111 | S02b | 2026-09-26 | 2026-10-25 | 5 | Kẽm này thì có chất lượng không? Đây là câu trả lời #2ababao #tubinhthachheo #kemdsd  | 2025-11-12T21:15:03+07:00 | 124172277.33 |
| S02b:ec675f6b6682:1 | https://www.tiktok.com/@camnangsuckhoe999/video/7669570500837920020 | S02b | 2026-09-26 | 2026-10-25 | 2 | Bí Quyết Giúp Anh Em Phục Hồi Cơ Thể Về Trạng Thái Tràn Đầy Năng Lượng #LearnOnTikTok #xuh… | 2026-08-03T05:50:46+07:00 | 179807254.51 |
| S02b:ec675f6b6682:1 | https://www.tiktok.com/@lamdao.dsdpharma/video/7572981272767663368 | S02b | 2026-09-26 | 2026-10-25 | 9 | Trả lời @ᏆⅅũℕᎶ từ 15 trở lên là có thể dùng Kẽm #kemdsd #kemdsdplus #lamdao #suckhoenamgio… | 2025-11-15T22:55:08+07:00 | 68903949.06 |

**kẽm, table `video`** (30 rows)

| video_url | video_id | platform | product_key | link_basis | capture_id |
|---|---|---|---|---|---|
| https://www.tiktok.com/@thuhakhoedep/video/7657096112381119764 | 7657096112381119764 | tiktok | tiktok_shop:1729958693491935262 | PROVIDER_LINK | S02b:ec675f6b6682:1 |
| https://www.tiktok.com/@camnangsuckhoe999/video/7669570500837920020 | 7669570500837920020 | tiktok | tiktok_shop:1729958693491935262 | PROVIDER_LINK | S02b:ec675f6b6682:1 |
| https://www.tiktok.com/@vlogminhhai/video/7605823491094416661 | 7605823491094416661 | tiktok | tiktok_shop:1729958693491935262 | PROVIDER_LINK | S02b:ec675f6b6682:1 |

## S14: Video readings

**kẽm, table `video_reading`** (3 rows)

| capture_id | video_url | origin | duration_s | caption_source | model_id | media_bytes | read_at |
|---|---|---|---|---|---|---|---|
| S14:0bacc38bb251:3 | https://www.tiktok.com/@bacsibien/video/7642558908799700231 | EXPANDED_SEARCH | 48.135 | MODEL_TRANSCRIBED | gemini-3.8-flash-high | 2947303 | 2026-10-26T02:04:01.326Z |
| S14:0bacc38bb251:4 | https://www.tiktok.com/@bacluongdinhduongthan/video/7472367489947602194 | EXPANDED_SEARCH | 64.0 | NATIVE_SUBTITLE | gemini-3.8-flash-high | 3222 | 2026-10-26T02:04:36.278Z |
| S14:0bacc38bb251:5 | https://www.tiktok.com/@imochi.vn/video/7690943902592912660 | EXPANDED_SEARCH | 60.0 | NATIVE_SUBTITLE | gemini-3.8-flash-high | 2399 | 2026-10-26T02:04:45.064Z |

**kẽm, table `video_segment`** (110 rows)

| capture_id | segment_type | seq | start_s | end_s | text |
|---|---|---|---|---|---|
| S14:0bacc38bb251:3 | on_screen | 0 | 0.0 | 4.5 | 5:30 AM |
| S14:0bacc38bb251:3 | on_screen | 1 | 7.4 | 9.9 | TẠI SAO PHẢI UỐNG KẼM TRƯỚC ĂN SÁNG |
| S14:0bacc38bb251:3 | on_screen | 2 | 10.3 | 12.3 | THÌ ĐỂ CHÚNG TA CÓ THỂ |

## S19b: Google suggestions

**vitamin c, table `search_suggestion`** (240 rows)

| prefix | rank | suggestion | collected_at | capture_id |
|---|---|---|---|---|
| vitamin c | 1 | vitamin c 500mg | 2026-11-03T18:44:58.427Z | S19b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:69 |
| vitamin c | 2 | vitamin c có tác dụng j | 2026-11-03T18:44:58.427Z | S19b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:69 |
| vitamin c | 3 | vitamin c serum | 2026-11-03T18:44:58.427Z | S19b:3d66fbda-9714-4be0-82f2-b0800c0b04eb:69 |

**kẽm, table `search_suggestion`** (665 rows)

| prefix | rank | suggestion | collected_at | capture_id |
|---|---|---|---|---|
| viên uống kẽm | 1 | viên uống kẽm | 2026-10-29T12:57:41Z | S19b:afd5378010a4:0 |
| viên uống kẽm | 2 | viên uống kẽm magie | 2026-10-29T12:57:41Z | S19b:afd5378010a4:0 |
| viên uống kẽm | 3 | viên uống kẽm pharmacity | 2026-10-29T12:57:41Z | S19b:afd5378010a4:0 |

## S29: Google AI Overview

**vitamin c, table `ai_overview_block`** (15 rows)

| query | block_seq | block_type | text | reference_indexes | capture_id |
|---|---|---|---|---|---|
| vitamin c | 0 | paragraph | Vitamin C (axit ascorbic) là một loại vitamin thiết yếu tan trong nước, đóng vai trò quan … | [0,1] | S29:3d66fbda-9714-4be0-82f2-b0800c0b04eb:COLLECTION:41 |
| vitamin c | 1 | heading | Công dụng chính |  | S29:3d66fbda-9714-4be0-82f2-b0800c0b04eb:COLLECTION:41 |
| vitamin c | 2 | list_item | Tăng cường miễn dịch: Kích thích hoạt động của bạch cầu, giúp cơ thể chống lại nhiễm trùng… |  | S29:3d66fbda-9714-4be0-82f2-b0800c0b04eb:COLLECTION:41 |

**vitamin c, table `ai_overview_reference`** (10 rows)

| query | ref_index | title | link | site | snippet | capture_id |
|---|---|---|---|---|---|---|
| vitamin c | 0 | Vitamin C là gì, công dụng với cơ thể và cách bổ sung hiệu quả | https://medlatec.vn/tin-tuc/vitamin-c-la-gi-cong-dung-voi-co-the-va-cach-bo-sung-hieu-qua-… | Bệnh viện Đa khoa MEDLATEC | - Bản chất: Acid ascorbic, tan trong nước, dễ oxy hóa. - Liều khuyến cáo hô hấp: 100-200mg… | S29:3d66fbda-9714-4be0-82f2-b0800c0b04eb:COLLECTION:41 |
| vitamin c | 1 | Lợi ích, liều lượng và tác dụng phụ của vitamin C - Examine.com | https://translate.google.com/translate?u=https://examine.com/supplements/vitamin-c/&hl=vi&… | Examine.com | Vitamin C, hay axit ascorbic, là một loại vitamin thiết yếu có đặc tính chống oxy hóa, đón… | S29:3d66fbda-9714-4be0-82f2-b0800c0b04eb:COLLECTION:41 |
| vitamin c | 2 | Vitamin C và chức năng miễn dịch - PMC | https://translate.google.com/translate?u=https://pmc.ncbi.nlm.nih.gov/articles/PMC5707683/… | National Institutes of Health (NIH) / (.gov) | Vitamin C kích thích sự di chuyển của bạch cầu trung tính đến vị trí nhiễm trùng, tăng cườ… | S29:3d66fbda-9714-4be0-82f2-b0800c0b04eb:COLLECTION:41 |

**kẽm, table `ai_overview_block`** (12 rows)

| query | block_seq | block_type | text | reference_indexes | capture_id |
|---|---|---|---|---|---|
| viên uống kẽm | 0 | paragraph | Viên uống bổ sung kẽm giúp tăng cường hệ miễn dịch, hỗ trợ sinh lý, cải thiện tình trạng r… | [0,1,2,3,4] | S29:f0f4799a-f9b3-4204-91b2-682ab79d0fce:COLLECTION:54 |
| viên uống kẽm | 1 | heading | Tác dụng chính |  | S29:f0f4799a-f9b3-4204-91b2-682ab79d0fce:COLLECTION:54 |
| viên uống kẽm | 2 | list_item | Tăng cường miễn dịch: Hỗ trợ hoạt động của các tế bào miễn dịch, giúp cơ thể chống lại bện… |  | S29:f0f4799a-f9b3-4204-91b2-682ab79d0fce:COLLECTION:54 |

**kẽm, table `ai_overview_reference`** (7 rows)

| query | ref_index | title | link | site | snippet | capture_id |
|---|---|---|---|---|---|---|
| viên uống kẽm | 0 | Viên uống DHC Zinc bổ sung kẽm, tăng cường sức khỏe (30 viên) | https://nhathuoclongchau.com.vn/thuc-pham-chuc-nang/dhc-zinc-30v-35783.html | Nhà thuốc Long Châu | Product: Viên giúp cơ thể khỏe mạnh Zinc DHC Brand: DHC (Nhật Bản) Price: 110.000đ/Gói (30… | S29:f0f4799a-f9b3-4204-91b2-682ab79d0fce:COLLECTION:54 |
| viên uống kẽm | 1 | Viên uống bổ sung kẽm: Uống lúc nào tốt và những lưu ý y khoa | https://medlatec.vn/tin-tuc/vien-uong-bo-sung-kem-uong-luc-nao-tot-nhat-va-nhung-luu-y-y-k… | Bệnh viện Đa khoa MEDLATEC | * Giới thiệu. Giới thiệu. Hệ thống MEDLATEC GROUP. Công bố Cơ sở đủ điều kiện. * Dịch vụ y… | S29:f0f4799a-f9b3-4204-91b2-682ab79d0fce:COLLECTION:54 |
| viên uống kẽm | 2 | Viên uống bổ sung kẽm DHC 60 viên chính hãng Nhật Bản | https://www.hangngoainhap.com.vn/2493-vien-uong-bo-sung-kem-dhc-60-vien-chinh-hang-nhat-ba… | Hàng Ngoại Nhập Store | - SP: Viên uống bổ sung kẽm DHC 60 viên - Xuất xứ: Nhật Bản - Hãng: DHC - Giá: 119.000đ (t… | S29:f0f4799a-f9b3-4204-91b2-682ab79d0fce:COLLECTION:54 |
