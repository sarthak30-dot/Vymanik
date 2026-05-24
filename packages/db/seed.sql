-- UrjaScan — seed data (Rajpur Solar Plant demo)
-- Run this AFTER 001_init.sql

-- ─── Plant ─────────────────────────────────────────────────────────────────
INSERT INTO plants (id, name, location, capacity_mw, total_panels, last_inspection, next_inspection, health_score, daily_loss_inr, daily_loss_kwh, feed_in_tariff, lat, lng)
VALUES ('plant-rajpur-1', 'Rajpur Solar Plant', 'Rajasthan', 2.3, 863, '3 May 2026', '3 August 2026', 83, 2340, 47, 4.5, 26.4521, 73.0192)
ON CONFLICT (id) DO NOTHING;

-- ─── Anomalies ─────────────────────────────────────────────────────────────
INSERT INTO anomalies (id, inspection_id, plant_id, panel_id, row, col, type, delta_t, severity, string, inverter, status, date, inspection_time, rgb_note, gps_lat, gps_lng, peak_temp, ref_temp, irradiance, module_serial, daily_loss_inr, daily_loss_kwh)
VALUES
  ('1',  'insp-may-2026','plant-rajpur-1','R14-M07',14, 7, 'Multi Hotspot',       47,'critical','String 03','INV-1','New',          '3 May 2026','09:14 AM','Surface discolouration visible — suspected cell-level cracking',            26.4521,73.0192,89,42,847,'VYM-2021-8847',180,3.6),
  ('2',  'insp-may-2026','plant-rajpur-1','R08-M03', 8, 3, 'String Open Circuit', 61,'critical','String 01','INV-1','New',          '3 May 2026','09:22 AM','Junction box lid partially open — possible water ingress',                 26.4519,73.0188,103,42,847,'VYM-2021-8203',245,4.9),
  ('3',  'insp-may-2026','plant-rajpur-1','R22-M11',22,11, 'PID Detected',        38,'critical','String 08','INV-2','Acknowledged', '3 May 2026','10:05 AM','No visible external damage — PID confirmed via thermal signature only',    26.4525,73.0197,80,42,847,'VYM-2021-9011',160,3.2),
  ('4',  'insp-may-2026','plant-rajpur-1','R02-M05', 2, 5, 'Diode Failure',       41,'critical','String 02','INV-1','New',          '3 May 2026','09:31 AM','Burn mark on rear contact visible at module corner',                       26.4517,73.0185,83,42,847,'VYM-2021-7755',175,3.5),
  ('5',  'insp-may-2026','plant-rajpur-1','R05-M14', 5,14, 'Diode Failure',       29,'medium', 'String 02','INV-1','In Repair',    '3 May 2026','09:38 AM','Slight yellowing on backsheet at bypass diode position',                   26.4520,73.0190,71,42,847,'VYM-2021-7901',95,1.9),
  ('6',  'insp-may-2026','plant-rajpur-1','R17-M02',17, 2, 'Bypassed Substring',  22,'medium', 'String 06','INV-2','New',          '3 May 2026','10:17 AM','No visible damage — bypass confirmed thermally',                            26.4523,73.0194,64,42,847,'VYM-2021-8512',75,1.5),
  ('7',  'insp-may-2026','plant-rajpur-1','R31-M09',31, 9, 'Heated Junction Box', 24,'medium', 'String 11','INV-3','New',          '3 May 2026','10:44 AM','Junction box seal degraded — O-ring replacement required',                  26.4528,73.0201,66,42,847,'VYM-2021-9301',80,1.6),
  ('8',  'insp-may-2026','plant-rajpur-1','R10-M08',10, 8, 'Hotspot',             26,'medium', 'String 04','INV-1','Acknowledged', '3 May 2026','09:55 AM','Micro-crack suspected — no surface fracture visible',                       26.4521,73.0191,68,42,847,'VYM-2021-8123',88,1.8),
  ('9',  'insp-may-2026','plant-rajpur-1','R25-M04',25, 4, 'Bypassed Substring',  21,'medium', 'String 09','INV-2','New',          '3 May 2026','10:28 AM','No visible damage — bypass confirmed thermally',                            26.4527,73.0198,63,42,847,'VYM-2021-8801',72,1.4),
  ('10', 'insp-may-2026','plant-rajpur-1','R12-M15',12,15, 'Hotspot',             23,'medium', 'String 05','INV-1','New',          '3 May 2026','10:01 AM','Bird dropping accumulation over affected cell — clean before re-inspection',26.4522,73.0192,65,42,847,'VYM-2021-8333',78,1.6),
  ('11', 'insp-may-2026','plant-rajpur-1','R03-M21', 3,21, 'Soiling',          NULL,'normal', 'String 01','INV-1','New',          '3 May 2026','09:18 AM','Heavy dust accumulation across top third of module',                        26.4518,73.0186,NULL,NULL,NULL,NULL,NULL,NULL),
  ('12', 'insp-may-2026','plant-rajpur-1','R44-M06',44, 6, 'Shaded Module',    NULL,'normal', 'String 12','INV-3','New',          '3 May 2026','11:02 AM','Partial shadow from adjacent structure during morning hours',               26.4532,73.0205,NULL,NULL,NULL,NULL,NULL,NULL),
  ('13', 'insp-may-2026','plant-rajpur-1','R19-M13',19,13, 'Soiling',          NULL,'normal', 'String 07','INV-2','Closed',        '3 May 2026','10:22 AM','Module cleaned during previous O&M cycle — surface clear',                 26.4524,73.0195,NULL,NULL,NULL,NULL,NULL,NULL),
  ('14', 'insp-may-2026','plant-rajpur-1','R27-M10',27,10, 'Shading',          NULL,'normal', 'String 10','INV-3','New',          '3 May 2026','10:36 AM','Nearby vegetation growth causing intermittent shading — trimming recommended',26.4528,73.0200,NULL,NULL,NULL,NULL,NULL,NULL),
  ('15', 'insp-may-2026','plant-rajpur-1','R36-M02',36, 2, 'Soiling',          NULL,'normal', 'String 11','INV-3','New',          '3 May 2026','10:51 AM','Bird dropping streak across cell row 2 — schedule cleaning',                26.4530,73.0203,NULL,NULL,NULL,NULL,NULL,NULL),
  ('16', 'insp-may-2026','plant-rajpur-1','R40-M18',40,18, 'Hotspot',             19,'medium', 'String 12','INV-3','New',          '3 May 2026','10:57 AM','No visible surface defect — internal delamination possible',                26.4531,73.0204,61,42,847,'VYM-2021-9601',65,1.3)
ON CONFLICT (id) DO NOTHING;

-- ─── Inspection history ────────────────────────────────────────────────────
INSERT INTO inspection_history (plant_id, date, critical, medium, normal, panels, pilot)
VALUES
  ('plant-rajpur-1', '4 Sep 2025',  11, 22, 830, 863, 'Rahul S.'),
  ('plant-rajpur-1', '12 Jan 2026',  7, 18, 838, 863, 'Arjun K.'),
  ('plant-rajpur-1', '3 May 2026',   4, 12, 847, 863, 'Arjun K.')
ON CONFLICT DO NOTHING;
