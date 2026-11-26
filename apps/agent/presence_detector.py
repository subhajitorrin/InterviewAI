import sys
import json
import base64
import cv2
import numpy as np

# Load OpenCV pre-trained Haar Cascades for facial features
CASCADE_FRONTAL_ALT2 = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml')
CASCADE_FRONTAL_DEFAULT = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
CASCADE_FRONTAL_ALT = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_alt.xml')
CASCADE_PROFILE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_profileface.xml')
CASCADE_UPPER = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_upperbody.xml')
CASCADE_EYES = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

def is_valid_face_candidate(img_bgr: np.ndarray, x: int, y: int, w: int, h: int) -> bool:
    """
    Validates that a detected candidate bounding box is actually a human face:
    1. Realistic human face aspect ratio (between 0.65 and 1.45)
    2. Sufficient size at webcam distance (>= 48x48)
    3. Human skin-tone pixel presence in YCrCb color space (> 12% skin pixels)
       This strictly filters out mugs, books, pillows, chairs, furniture, door knobs,
       and background textures that might otherwise trigger Haar cascades.
    """
    if w < 48 or h < 48:
        return False

    aspect = w / float(h)
    if aspect < 0.65 or aspect > 1.45:
        return False

    face_roi = img_bgr[y:y+h, x:x+w]
    if face_roi.size == 0:
        return False

    try:
        ycrcb = cv2.cvtColor(face_roi, cv2.COLOR_BGR2YCrCb)
        # Biometric human skin color ranges in YCrCb across all skin tones
        # Cr: 130..175, Cb: 75..135
        skin_mask = (
            (ycrcb[:, :, 1] >= 130) & (ycrcb[:, :, 1] <= 175) &
            (ycrcb[:, :, 2] >= 75) & (ycrcb[:, :, 2] <= 135)
        )
        skin_ratio = float(np.mean(skin_mask))
        if skin_ratio >= 0.12:
            return True

        # If skin ratio is borderline (dim or tinted lighting), check for eyes inside upper face ROI
        if skin_ratio >= 0.05 and not CASCADE_EYES.empty():
            upper_face_gray = cv2.cvtColor(face_roi[:int(0.65 * h), :], cv2.COLOR_BGR2GRAY)
            eyes = CASCADE_EYES.detectMultiScale(
                upper_face_gray,
                scaleFactor=1.1,
                minNeighbors=3,
                minSize=(14, 14)
            )
            if len(eyes) >= 1:
                return True

        return False
    except Exception:
        return False

def detect_presence_from_image_bytes(image_bytes: bytes) -> dict:
    try:
        if not image_bytes or len(image_bytes) == 0:
            return {
                "cameraActive": False,
                "isPresent": False,
                "reason": "Empty camera frame",
                "method": "opencv",
            }

        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None or img.size == 0:
            return {
                "cameraActive": False,
                "isPresent": False,
                "reason": "Failed to decode camera frame",
                "method": "opencv",
            }

        # 1. Check for physically covered or totally black camera
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))

        if mean_brightness < 8.0:
            return {
                "cameraActive": False,
                "isPresent": False,
                "brightness": round(mean_brightness, 1),
                "reason": "Camera is covered or completely dark",
                "method": "opencv-dark",
            }

        # 2. Check Frontal Face on raw grayscale with high accuracy (minNeighbors=5, minSize=(48, 48))
        # Frontal Alt2 (highest accuracy, trained with gentle AdaBoost)
        if not CASCADE_FRONTAL_ALT2.empty():
            faces = CASCADE_FRONTAL_ALT2.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(48, 48)
            )
            for (x, y, w, h) in faces:
                if is_valid_face_candidate(img, x, y, w, h):
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(faces),
                        "brightness": round(mean_brightness, 1),
                        "bbox": [int(x), int(y), int(w), int(h)],
                        "method": "opencv-face-alt2",
                    }

        # Frontal Default
        if not CASCADE_FRONTAL_DEFAULT.empty():
            faces = CASCADE_FRONTAL_DEFAULT.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(48, 48)
            )
            for (x, y, w, h) in faces:
                if is_valid_face_candidate(img, x, y, w, h):
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(faces),
                        "brightness": round(mean_brightness, 1),
                        "bbox": [int(x), int(y), int(w), int(h)],
                        "method": "opencv-face-default",
                    }

        # Frontal Alt
        if not CASCADE_FRONTAL_ALT.empty():
            faces = CASCADE_FRONTAL_ALT.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(48, 48)
            )
            for (x, y, w, h) in faces:
                if is_valid_face_candidate(img, x, y, w, h):
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(faces),
                        "brightness": round(mean_brightness, 1),
                        "bbox": [int(x), int(y), int(w), int(h)],
                        "method": "opencv-face-alt",
                    }

        # Profile Face (turned side angle)
        if not CASCADE_PROFILE.empty():
            for flip_code, variant in [(None, gray), (1, cv2.flip(gray, 1))]:
                profile_faces = CASCADE_PROFILE.detectMultiScale(
                    variant,
                    scaleFactor=1.12,
                    minNeighbors=5,
                    minSize=(48, 48)
                )
                for (x, y, w, h) in profile_faces:
                    real_x = (img.shape[1] - (x + w)) if flip_code == 1 else x
                    if is_valid_face_candidate(img, real_x, y, w, h):
                        return {
                            "cameraActive": True,
                            "isPresent": True,
                            "faceDetected": True,
                            "facesCount": len(profile_faces),
                            "brightness": round(mean_brightness, 1),
                            "bbox": [int(real_x), int(y), int(w), int(h)],
                            "method": "opencv-profileface",
                        }

        # 3. Dim lighting enhancement with CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        clahe_gray = clahe.apply(gray)

        if not CASCADE_FRONTAL_ALT2.empty():
            faces = CASCADE_FRONTAL_ALT2.detectMultiScale(
                clahe_gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(48, 48)
            )
            for (x, y, w, h) in faces:
                if is_valid_face_candidate(img, x, y, w, h):
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(faces),
                        "brightness": round(mean_brightness, 1),
                        "bbox": [int(x), int(y), int(w), int(h)],
                        "method": "opencv-face-clahe",
                    }

        # 4. Check Upper Body (head + shoulders when sitting at desk)
        if not CASCADE_UPPER.empty():
            ubodies = CASCADE_UPPER.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(80, 80)
            )
            for (ux, uy, uw, uh) in ubodies:
                # Check top 40% of the detected upper body box for head/skin tone
                head_roi = img[uy:uy+int(0.4*uh), ux:ux+uw]
                if head_roi.size > 0:
                    ycrcb = cv2.cvtColor(head_roi, cv2.COLOR_BGR2YCrCb)
                    skin_mask = (
                        (ycrcb[:, :, 1] >= 130) & (ycrcb[:, :, 1] <= 175) &
                        (ycrcb[:, :, 2] >= 75) & (ycrcb[:, :, 2] <= 135)
                    )
                    if float(np.mean(skin_mask)) >= 0.12:
                        return {
                            "cameraActive": True,
                            "isPresent": True,
                            "faceDetected": True,
                            "facesCount": 1,
                            "brightness": round(mean_brightness, 1),
                            "bbox": [int(ux), int(uy), int(uw), int(uh)],
                            "method": "opencv-upperbody",
                        }

        # If no verified face or candidate is detected:
        # Candidate is strictly NOT in front of the camera.
        return {
            "cameraActive": True,
            "isPresent": False,
            "faceDetected": False,
            "brightness": round(mean_brightness, 1),
            "reason": "No face detected in camera frame",
            "method": "opencv-no-face",
        }

    except Exception as e:
        return {
            "cameraActive": True,
            "isPresent": False,
            "error": str(e),
            "method": "opencv-error",
        }

def detect_presence_from_base64(b64_string: str) -> dict:
    try:
        b64_clean = b64_string.strip()
        if "," in b64_clean:
            b64_clean = b64_clean.split(",", 1)[1]
        image_bytes = base64.b64decode(b64_clean)
        return detect_presence_from_image_bytes(image_bytes)
    except Exception as e:
        return {
            "cameraActive": True,
            "isPresent": False,
            "error": f"Base64 decode error: {e}",
            "method": "opencv-error",
        }

if __name__ == "__main__":
    if "--daemon" in sys.argv:
        # Long-running daemon mode for real-time IPC/stream processing
        # Keeps OpenCV models resident in memory for sub-20ms per-frame response
        for line in sys.stdin:
            raw = line.strip()
            if not raw:
                continue
            if raw == "PING":
                print(json.dumps({"pong": True}), flush=True)
                continue
            res = detect_presence_from_base64(raw)
            print(json.dumps(res), flush=True)
    else:
        # Single-shot execution mode
        input_data = ""
        if len(sys.argv) > 1:
            input_data = sys.argv[1]
        else:
            input_data = sys.stdin.read().strip()

        result = detect_presence_from_base64(input_data)
        print(json.dumps(result))
