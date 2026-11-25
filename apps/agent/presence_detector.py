import sys
import json
import base64
import cv2
import numpy as np

# Load OpenCV pre-trained Haar Cascades
FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
PROFILE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_profileface.xml')
UPPERBODY_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_upperbody.xml')

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

        # Check for black/covered camera
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))

        if mean_brightness < 12.0:
            return {
                "cameraActive": False,
                "isPresent": False,
                "brightness": mean_brightness,
                "reason": "Camera is covered or completely dark",
                "method": "opencv",
            }

        # Improve contrast for varying lighting conditions
        equalized = cv2.equalizeHist(gray)

        # 1. Frontal Face Detection
        faces = FACE_CASCADE.detectMultiScale(
            equalized,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE
        )

        if len(faces) > 0:
            boxes = [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for (x, y, w, h) in faces]
            return {
                "cameraActive": True,
                "isPresent": True,
                "faceDetected": True,
                "facesCount": len(faces),
                "faces": boxes,
                "brightness": round(mean_brightness, 1),
                "method": "opencv-frontalface",
            }

        # 2. Profile / Angled Face Detection
        profile_faces = PROFILE_CASCADE.detectMultiScale(
            equalized,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(30, 30)
        )

        if len(profile_faces) > 0:
            boxes = [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for (x, y, w, h) in profile_faces]
            return {
                "cameraActive": True,
                "isPresent": True,
                "faceDetected": True,
                "facesCount": len(profile_faces),
                "faces": boxes,
                "brightness": round(mean_brightness, 1),
                "method": "opencv-profileface",
            }

        # 3. Upper Body / Torso Detection
        bodies = UPPERBODY_CASCADE.detectMultiScale(
            equalized,
            scaleFactor=1.1,
            minNeighbors=3,
            minSize=(50, 50)
        )

        if len(bodies) > 0:
            return {
                "cameraActive": True,
                "isPresent": True,
                "faceDetected": False,
                "personDetected": True,
                "brightness": round(mean_brightness, 1),
                "method": "opencv-upperbody",
            }

        # If variance is high enough and brightness is normal room lighting,
        # but no exact face cascade triggered (e.g. wearing glasses/hat or low res),
        # return not detected with actionable feedback
        return {
            "cameraActive": True,
            "isPresent": False,
            "faceDetected": False,
            "brightness": round(mean_brightness, 1),
            "reason": "No person or face detected in camera view",
            "method": "opencv",
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
        # Strip data URL prefix if present (e.g. data:image/jpeg;base64,...)
        if "," in b64_string:
            b64_string = b64_string.split(",", 1)[1]
        image_bytes = base64.b64decode(b64_string)
        return detect_presence_from_image_bytes(image_bytes)
    except Exception as e:
        return {
            "cameraActive": False,
            "isPresent": False,
            "error": f"Base64 decode error: {e}",
            "method": "opencv-error",
        }

if __name__ == "__main__":
    # Support stdin or CLI arg
    input_data = ""
    if len(sys.argv) > 1:
        input_data = sys.argv[1]
    else:
        input_data = sys.stdin.read().strip()

    result = detect_presence_from_base64(input_data)
    print(json.dumps(result))
