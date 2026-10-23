import 'package:flutter/material.dart';

/// Colours of the Tripti website (burgundy and gold on cream).
class TriptiColors {
  static const primary = Color(0xFF84202F);
  static const gold = Color(0xFFE1A72E);
  static const background = Color(0xFFF3EDDC);
  static const card = Color(0xFFF8F5EC);
  static const ink = Color(0xFF5F1B26);
  static const border = Color(0xFFE2D0AA);
  static const muted = Color(0xFFE2DACA);
  static const green = Color(0xFF15803D);
  static const amber = Color(0xFFB45309);
  static const red = Color(0xFFB91C1C);
  static const blue = Color(0xFF1D4ED8);
}

ThemeData triptiTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: TriptiColors.primary,
    primary: TriptiColors.primary,
    secondary: TriptiColors.gold,
    surface: TriptiColors.card,
    brightness: Brightness.light,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: TriptiColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: TriptiColors.primary,
      foregroundColor: Colors.white,
      elevation: 0,
      titleTextStyle: TextStyle(fontFamily: 'serif', fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white),
    ),
    cardTheme: CardThemeData(
      color: TriptiColors.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: TriptiColors.border, width: 1.5)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: TriptiColors.primary,
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: TriptiColors.primary,
        minimumSize: const Size(48, 48),
        side: const BorderSide(color: TriptiColors.primary, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.6),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: TriptiColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: TriptiColors.border, width: 1.5)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: TriptiColors.primary, width: 2)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: TriptiColors.card,
      surfaceTintColor: Colors.transparent,
      indicatorColor: TriptiColors.primary.withValues(alpha: 0.14),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? TriptiColors.primary : TriptiColors.ink.withValues(alpha: 0.75))),
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: TriptiColors.ink)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: TriptiColors.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      titleTextStyle: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: TriptiColors.ink),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: TriptiColors.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    datePickerTheme: const DatePickerThemeData(backgroundColor: TriptiColors.card, surfaceTintColor: Colors.transparent),
    popupMenuTheme: const PopupMenuThemeData(color: TriptiColors.card, surfaceTintColor: Colors.transparent),
    menuTheme: const MenuThemeData(style: MenuStyle(backgroundColor: WidgetStatePropertyAll(TriptiColors.card), surfaceTintColor: WidgetStatePropertyAll(Colors.transparent))),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: const DividerThemeData(color: TriptiColors.border, thickness: 1),
    listTileTheme: const ListTileThemeData(iconColor: TriptiColors.primary),
    chipTheme: ChipThemeData(
      backgroundColor: TriptiColors.card,
      selectedColor: TriptiColors.primary,
      labelStyle: const TextStyle(color: TriptiColors.ink, fontWeight: FontWeight.w600),
      secondaryLabelStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
      side: const BorderSide(color: TriptiColors.border),
      shape: StadiumBorder(side: const BorderSide(color: TriptiColors.border)),
    ),
  );
}
