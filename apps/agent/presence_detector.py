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
CASCADE_EYES = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
CASCADE_GLASSES = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye_tree_eyeglasses.xml')

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

        # 2. Advanced Contrast Enhancement (CLAHE + Standard Equalization)
        # CLAHE (Contrast Limited Adaptive Histogram Equalization) provides superior
        # feature contrast in typical webcam lighting without blowing out highlights.
        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
        clahe_gray = clahe.apply(gray)
        eq_gray = cv2.equalizeHist(gray)

        # 3. Check Frontal Face across both contrast-enhanced representations
        for enhanced in [clahe_gray, eq_gray]:
            # Frontal Alt2 (highest accuracy on webcams)
            if not CASCADE_FRONTAL_ALT2.empty():
                faces = CASCADE_FRONTAL_ALT2.detectMultiScale(
                    enhanced,
                    scaleFactor=1.05,
                    minNeighbors=3,
                    minSize=(28, 28)
                )
                if len(faces) > 0:
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(faces),
                        "brightness": round(mean_brightness, 1),
                        "method": "opencv-face-alt2",
                    }

            # Frontal Default
            if not CASCADE_FRONTAL_DEFAULT.empty():
                faces = CASCADE_FRONTAL_DEFAULT.detectMultiScale(
                    enhanced,
                    scaleFactor=1.07,
                    minNeighbors=3,
                    minSize=(28, 28),
                    flags=cv2.CASCADE_SCALE_IMAGE
                )
                if len(faces) > 0:
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(faces),
                        "brightness": round(mean_brightness, 1),
                        "method": "opencv-face-default",
                    }

            # Frontal Alt
            if not CASCADE_FRONTAL_ALT.empty():
                faces = CASCADE_FRONTAL_ALT.detectMultiScale(
                    enhanced,
                    scaleFactor=1.07,
                    minNeighbors=3,
                    minSize=(28, 28)
                )
                if len(faces) > 0:
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(faces),
                        "brightness": round(mean_brightness, 1),
                        "method": "opencv-face-alt",
                    }

        # 4. Check Profile Face (both left profile and mirrored right profile)
        if not CASCADE_PROFILE.empty():
            for flip_variant in [clahe_gray, cv2.flip(clahe_gray, 1)]:
                profile_faces = CASCADE_PROFILE.detectMultiScale(
                    flip_variant,
                    scaleFactor=1.08,
                    minNeighbors=3,
                    minSize=(28, 28)
                )
                if len(profile_faces) > 0:
                    return {
                        "cameraActive": True,
                        "isPresent": True,
                        "faceDetected": True,
                        "facesCount": len(profile_faces),
                        "brightness": round(mean_brightness, 1),
                        "method": "opencv-profileface",
                    }

        # 5. Check Eye Pair / Glasses (detects when candidate is looking down at keyboard or screen)
        # In a real room, an eye-pair only appears on a human face.
        if not CASCADE_EYES.empty():
            eyes = CASCADE_EYES.detectMultiScale(
                clahe_gray,
                scaleFactor=1.08,
                minNeighbors=4,
                minSize=(14, 14)
            )
            if len(eyes) >= 2:
                return {
                    "cameraActive": True,
                    "isPresent": True,
                    "faceDetected": True,
                    "eyesCount": len(eyes),
                    "brightness": round(mean_brightness, 1),
                    "method": "opencv-eyes",
                }

        if not CASCADE_GLASSES.empty():
            g_eyes = CASCADE_GLASSES.detectMultiScale(
                clahe_gray,
                scaleFactor=1.08,
                minNeighbors=3,
                minSize=(14, 14)
            )
            if len(g_eyes) >= 2:
                return {
                    "cameraActive": True,
                    "isPresent": True,
                    "faceDetected": True,
                    "eyesCount": len(g_eyes),
                    "brightness": round(mean_brightness, 1),
                    "method": "opencv-glasses",
                }

        # If no face or facial features are detected:
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
        if "," in b64_string:
            b64_string = b64_string.split(",", 1)[1]
        image_bytes = base64.b64decode(b64_string)
        return detect_presence_from_image_bytes(image_bytes)
    except Exception as e:
        return {
            "cameraActive": True,
            "isPresent": False,
            "error": f"Base64 decode error: {e}",
            "method": "opencv-error",
        }

if __name__ == "__main__":
    input_data = ""
    if len(sys.argv) > 1:
        input_data = sys.argv[1]
    else:
        input_data = sys.stdin.read().strip()

    result = detect_presence_from_base64(input_data)
    print(json.dumps(result))
