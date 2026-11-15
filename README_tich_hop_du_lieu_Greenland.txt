HUONG DAN TICH HOP DU LIEU GREENLAND - NSIDC-0788 / GID001
===========================================================

CAC FILE DA TAO
---------------
1) greenland_GID001_data.json
   File JSON tong hop, de app web doc truc tiep bang fetch().
   Gom metadata, mot diem toa do KML, 941 dong time-series va 1,296 quan sat DBF.

2) greenland_GID001.sqlite
   Database SQLite co 3 bang: metadata, timeseries, observations.

3) greenland_GID001_timeseries.csv
   CSV da chuan hoa ten cot de nhap vao cac cong cu ve bieu do.

4) greenland_GID001_observations.csv
   Bang quan sat tach tu DBF: glacier_id, satellite, error, date.

5) example_fetch_greenland.js
   Vi du JavaScript doc JSON trong app web.

CACH DUNG JSON TRONG APP WEB
----------------------------
- Copy greenland_GID001_data.json vao thu muc public/data/ cua app.
- Copy noi dung example_fetch_greenland.js vao module JS cua app.
- Goi loadGreenlandData() khi trang can hien thi du lieu.

Du lieu bieu do:
- labels: data.timeseries.map(x => x.date)
- dien tich: data.timeseries.map(x => x.change_area_10_km2)
- chieu dai: data.timeseries.map(x => x.change_length_m)

Diem ban do:
- data.location.coordinates = [-51.559875, 71.763574]
- Thu tu toa do la kinh do, vi do (longitude, latitude), he WGS84.

CACH DUNG SQLITE
----------------
Mo file greenland_GID001.sqlite bang SQLite / DB Browser for SQLite.
Cac bang:
- metadata
- timeseries
- observations

GIOI HAN CAN BIET
-----------------
- CSV co 941 dong, tu 2013-03-30 den 2021-05-31.
- DBF co 1296 ban ghi.
- KML chi cung cap mot diem: longitude=-51.559875, latitude=71.763574.
- Bo file upload thieu .shp (geometry). File .shx khong the thay the .shp.
  Vi vay hien tai khong the ve duong bien / duong ket thuc song bang bo file nay.
- Ten bo du lieu co moc 1972-2022, nhung CSV time-series thuc te trong tap gui
  chi co moc 2013-03-30 den 2021-05-31. Khong duoc gan nhan rang CSV co du lieu
  day du tu 1972 den 2022.
- Cac gia tri duoc giu nguyen; hay doi chieu tai lieu NSIDC de dien giai dau +/-,
  don vi cua Error va y nghia khoa hoc truoc khi ket luan.

NEU APP CO BACKEND
------------------
Nen import SQLite vao backend va tao endpoint, vi du:
GET /api/greenland/GID001/timeseries
GET /api/greenland/GID001/observations
GET /api/greenland/GID001/metadata

Neu app chi la frontend web:
Dung JSON trong thu muc public/data va fetch() nhu vi du JS.
