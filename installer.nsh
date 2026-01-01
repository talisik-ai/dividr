; Custom NSIS script for DiviDr file associations
; This script registers .dividr files with the application

!macro customInstall
  ; Register file association
  WriteRegStr SHCTX "Software\Classes\.dividr" "" "DiviDr.Project"
  WriteRegStr SHCTX "Software\Classes\DiviDr.Project" "" "DiviDr Project"
  WriteRegStr SHCTX "Software\Classes\DiviDr.Project\DefaultIcon" "" "$INSTDIR\diviDr.exe,0"
  WriteRegStr SHCTX "Software\Classes\DiviDr.Project\shell\open\command" "" '"$INSTDIR\diviDr.exe" "%1"'

  ; Refresh shell icons
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ; Remove file association
  DeleteRegKey SHCTX "Software\Classes\.dividr"
  DeleteRegKey SHCTX "Software\Classes\DiviDr.Project"

  ; Refresh shell icons
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
