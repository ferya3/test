"""A frameless, always-on-top subtitle bar that floats over any video.

Drag it with the mouse, scroll to change the text size, double-click to
toggle the original-language line, right-click or Esc to quit.
"""

from PyQt6.QtCore import QObject, QPoint, QRectF, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QColor, QFont, QPainter, QPainterPath
from PyQt6.QtWidgets import QApplication, QLabel, QVBoxLayout, QWidget

from .translate import RTL_LANGUAGES

FONT_FAMILIES = ["Vazirmatn", "Segoe UI", "Tahoma"]


class Bridge(QObject):
    """Carries updates from worker threads to the GUI thread (Qt queues the calls)."""

    source = pyqtSignal(str)
    translation = pyqtSignal(str, str)
    status = pyqtSignal(str)


class SubtitleOverlay(QWidget):
    def __init__(self, target: str = "fa", font_size: int = 28, show_source: bool = True, hide_after: float = 8.0):
        super().__init__(
            None,
            Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool,
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowTitle("livesub")
        self._drag_from: QPoint | None = None
        self.font_size = font_size

        self.source_label = self._label(rtl=False)
        self.translation_label = self._label(rtl=target in RTL_LANGUAGES)
        self.source_label.setStyleSheet("color: #c8c8c8;")
        self.translation_label.setStyleSheet("color: #ffffff;")
        self.source_label.setVisible(show_source)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 12, 24, 14)
        layout.setSpacing(4)
        layout.addWidget(self.source_label)
        layout.addWidget(self.translation_label)
        self._apply_font()

        # Fade out when nobody has spoken for a while, so it does not cover the video.
        self.hide_timer = QTimer(self, singleShot=True, interval=int(hide_after * 1000))
        self.hide_timer.timeout.connect(self._clear)

        screen = QApplication.primaryScreen().availableGeometry()
        width = int(screen.width() * 0.7)
        self.setFixedWidth(width)  # height follows the text
        self.adjustSize()
        self.move(screen.left() + (screen.width() - width) // 2, screen.bottom() - 220)

    def _label(self, rtl: bool) -> QLabel:
        label = QLabel()
        label.setWordWrap(True)
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        label.setLayoutDirection(Qt.LayoutDirection.RightToLeft if rtl else Qt.LayoutDirection.LeftToRight)
        return label

    def _apply_font(self) -> None:
        big = QFont()
        big.setFamilies(FONT_FAMILIES)
        big.setPixelSize(self.font_size)
        big.setWeight(QFont.Weight.DemiBold)
        small = QFont(big)
        small.setPixelSize(max(12, int(self.font_size * 0.6)))
        small.setWeight(QFont.Weight.Normal)
        self.translation_label.setFont(big)
        self.source_label.setFont(small)
        self.adjustSize()

    # --- updates from the pipeline -------------------------------------------------

    def show_source(self, text: str) -> None:
        self.source_label.setText(text)
        self._touch()

    def show_translation(self, source: str, translation: str) -> None:
        self.source_label.setText(source)
        self.translation_label.setText(translation)
        self._touch()

    def show_status(self, text: str) -> None:
        self.translation_label.setText(text)
        self._touch()

    def _touch(self) -> None:
        self.adjustSize()
        self.hide_timer.start()
        self.update()

    def _clear(self) -> None:
        self.source_label.clear()
        self.translation_label.clear()
        self.update()

    # --- look ----------------------------------------------------------------------

    def paintEvent(self, event) -> None:
        if not (self.source_label.text() or self.translation_label.text()):
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        path = QPainterPath()
        path.addRoundedRect(QRectF(self.rect()), 12, 12)
        painter.fillPath(path, QColor(0, 0, 0, 170))

    # --- mouse and keyboard --------------------------------------------------------

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_from = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
        elif event.button() == Qt.MouseButton.RightButton:
            QApplication.quit()

    def mouseMoveEvent(self, event) -> None:
        if self._drag_from is not None:
            self.move(event.globalPosition().toPoint() - self._drag_from)

    def mouseReleaseEvent(self, event) -> None:
        self._drag_from = None

    def mouseDoubleClickEvent(self, event) -> None:
        self.source_label.setVisible(not self.source_label.isVisible())
        self.adjustSize()

    def wheelEvent(self, event) -> None:
        step = 2 if event.angleDelta().y() > 0 else -2
        self.font_size = max(14, min(72, self.font_size + step))
        self._apply_font()

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Escape:
            QApplication.quit()


def run_overlay(pipeline_factory, target: str, font_size: int, show_source: bool) -> int:
    """Open the overlay and start the pipeline built by `pipeline_factory(bridge)`."""
    app = QApplication([])
    overlay = SubtitleOverlay(target=target, font_size=font_size, show_source=show_source)
    bridge = Bridge()
    bridge.source.connect(overlay.show_source)
    bridge.translation.connect(overlay.show_translation)
    bridge.status.connect(overlay.show_status)

    pipeline = pipeline_factory(bridge)
    overlay.show()
    pipeline.start()
    code = app.exec()
    pipeline.stop()
    return code
