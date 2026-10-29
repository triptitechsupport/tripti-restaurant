import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/scope.dart';
import '../../core/stock_ai.dart';
import '../../core/theme.dart';

/// Opens the camera and returns the first barcode it reads (or a typed one).
Future<String?> scanBarcode(BuildContext context) => Navigator.of(context).push<String>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const BarcodeScanPage()));

/// Finds the stock item with this barcode.
Map<String, dynamic>? itemByBarcode(Iterable<Map<String, dynamic>> items, String code) {
  for (final i in items) {
    if ('${i['barcode'] ?? ''}' == code) return i;
  }
  return null;
}

class BarcodeScanPage extends StatefulWidget {
  const BarcodeScanPage({super.key});

  @override
  State<BarcodeScanPage> createState() => _BarcodeScanPageState();
}

class _BarcodeScanPageState extends State<BarcodeScanPage> {
  final _ctl = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool _done = false;

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  void _found(BarcodeCapture c) {
    if (_done) return;
    final code = c.barcodes.map((b) => b.rawValue ?? '').firstWhere((v) => v.trim().isNotEmpty, orElse: () => '');
    if (code.isEmpty) return;
    _done = true;
    Navigator.of(context).pop(code.trim());
  }

  Future<void> _type() async {
    final t = TextEditingController();
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr(context, 'Type the barcode', 'Barcode eintippen')),
        content: TextField(controller: t, autofocus: true, keyboardType: TextInputType.number, onSubmitted: (s) => Navigator.pop(ctx, s)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr(context, 'Back', 'Zurück'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, t.text), child: const Text('OK')),
        ],
      ),
    );
    if (v != null && v.trim().isNotEmpty && mounted) Navigator.of(context).pop(v.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(tr(context, 'Scan barcode', 'Barcode scannen')),
        actions: [
          IconButton(icon: const Icon(Icons.flashlight_on_outlined), tooltip: tr(context, 'Light', 'Licht'), onPressed: () => _ctl.toggleTorch()),
          IconButton(icon: const Icon(Icons.keyboard), tooltip: tr(context, 'Type it', 'Eintippen'), onPressed: _type),
        ],
      ),
      body: Stack(children: [
        MobileScanner(
          controller: _ctl,
          onDetect: _found,
          errorBuilder: (ctx, err) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                err.errorCode == MobileScannerErrorCode.permissionDenied ? tr(context, 'Camera permission is off. Allow the camera for Tripti Staff in the phone settings, or type the barcode.', 'Kamera-Erlaubnis fehlt. In den Handy-Einstellungen die Kamera für Tripti Staff erlauben oder den Barcode eintippen.') : tr(context, 'The camera could not start. Type the barcode instead.', 'Die Kamera startet nicht. Barcode bitte eintippen.'),
                style: const TextStyle(color: Colors.white),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
        Center(
          child: Container(
            width: 280,
            height: 160,
            decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 3), borderRadius: BorderRadius.circular(16)),
          ),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 32,
          child: Text(tr(context, 'Hold the barcode inside the frame.', 'Barcode in den Rahmen halten.'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

/// Takes (or picks) a photo and lets the server read it.
/// mode 'item': one product -> name, unit, category... (+ 'scannedBarcode'
/// when the photo shows a readable barcode).
/// mode 'delivery': supplier bill / delivery note -> lines.
Future<Map<String, dynamic>?> photoToStock(BuildContext context, {required String mode}) async {
  final session = AppScope.read(context);
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Text(
            mode == 'item' ? tr(context, 'Photo of the product: front of the pack with name and weight. The barcode helps too.', 'Foto vom Produkt: Vorderseite mit Name und Gewicht. Der Barcode hilft auch.') : tr(context, 'Photo of the supplier bill or delivery note, flat and sharp, all lines visible.', 'Foto der Lieferantenrechnung oder des Lieferscheins, flach und scharf, alle Zeilen sichtbar.'),
            style: const TextStyle(color: Colors.black54),
          ),
        ),
        ListTile(leading: const Icon(Icons.photo_camera_outlined), title: Text(tr(context, 'Take photo', 'Foto aufnehmen')), onTap: () => Navigator.pop(ctx, ImageSource.camera)),
        ListTile(leading: const Icon(Icons.photo_library_outlined), title: Text(tr(context, 'Choose from gallery', 'Aus Galerie wählen')), onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
      ]),
    ),
  );
  if (source == null || !context.mounted) return null;
  XFile? file;
  try {
    // Bills need more pixels to stay readable.
    final big = mode == 'delivery';
    file = await ImagePicker().pickImage(source: source, maxWidth: big ? 2200 : 1400, maxHeight: big ? 2200 : 1400, imageQuality: big ? 85 : 80);
  } catch (e) {
    if (context.mounted) toast(context, tr(context, 'Could not open the camera.', 'Kamera konnte nicht geöffnet werden.'), error: true);
    return null;
  }
  if (file == null || !context.mounted) return null;
  final bytes = await file.readAsBytes();
  if (!context.mounted) return null;
  String? code;
  if (mode == 'item' && !kIsWeb) {
    final ctl = MobileScannerController(autoStart: false);
    try {
      final cap = await ctl.analyzeImage(file.path);
      code = cap?.barcodes.map((b) => b.rawValue ?? '').firstWhere((v) => v.trim().isNotEmpty, orElse: () => '');
    } catch (_) {
      code = null;
    } finally {
      ctl.dispose();
    }
  }
  if (!context.mounted) return null;
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => PopScope(
      canPop: false,
      child: AlertDialog(
        content: Row(children: [
          const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(color: TriptiColors.primary)),
          const SizedBox(width: 18),
          Expanded(child: Text(mode == 'item' ? tr(context, 'Reading the product…', 'Produkt wird erkannt…') : tr(context, 'Reading the bill…', 'Rechnung wird gelesen…'))),
        ]),
      ),
    ),
  );
  Map<String, dynamic>? result;
  String? error;
  final offline = tr(context, 'No connection to the server.', 'Keine Verbindung zum Server.');
  try {
    result = await recognizePhoto(token: session.pb.authStore.token, bytes: bytes, mode: mode, lang: session.de ? 'de' : 'en', mediaType: file.mimeType ?? (file.path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'));
  } catch (e) {
    error = e is StockAiError ? e.message : offline;
  }
  if (!context.mounted) return null;
  Navigator.of(context, rootNavigator: true).pop();
  if (error != null) {
    toast(context, error, error: true);
    return null;
  }
  if (result != null && code != null && code.isNotEmpty) result['scannedBarcode'] = code;
  return result;
}
