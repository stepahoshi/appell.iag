import streamlit as st
import easyocr
from PIL import Image
import cv2
import io
import re
import numpy as np

def extract_frame_from_video(video_bytes):
    cap = cv2.VideoCapture(io.BytesIO(video_bytes))
    success, frame = cap.read()
    if success:
        _, buffer = cv2.imencode('.jpg', frame)
        return buffer.tobytes()
    return None

def extract_nicks_from_image(image_bytes):
    reader = easyocr.Reader(['en', 'ru'], gpu=False)  

    nparr = np.frombuffer(image_bytes, np.uint8)
    img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    result = reader.readtext(img_cv)
    text = ' '.join([detection[1] for detection in result])

    nicks = re.findall(r'[a-zA-Z0-9_]{3,20}', text)
    return list(set(nicks))

st.set_page_config(layout="wide")

st.title("Appell")

col1, col2, col3 = st.columns(3)

with col1:
    st.header("В строю")
    uploaded1 = st.file_uploader("Загрузи фото/видео строя", type=['jpg', 'png', 'mp4'], key="f1")
    if uploaded1:
        file_bytes = uploaded1.read()
        if uploaded1.type.startswith('video'):
            st.write("Беру кадр из видео...")
            image_bytes = extract_frame_from_video(file_bytes)
        else:
            image_bytes = file_bytes
        if image_bytes:
            formation_nicks = extract_nicks_from_image(image_bytes)
            st.write("Никнеймы в строю:")
            st.write(formation_nicks)
            st.session_state['formation'] = set(map(str.lower, formation_nicks))

with col2:
    st.header("Онлайн во фракции")
    uploaded2 = st.file_uploader("Загрузи фото списка онлайн", type=['jpg', 'png', 'mp4'], key="f2")
    if uploaded2:
        file_bytes = uploaded2.read()
        if uploaded2.type.startswith('video'):
            st.write("Беру кадр из видео...")
            image_bytes = extract_frame_from_video(file_bytes)
        else:
            image_bytes = file_bytes
        if image_bytes:
            online_nicks = extract_nicks_from_image(image_bytes)
            st.write("Никнеймы онлайн:")
            st.write(online_nicks)
            st.session_state['online'] = set(map(str.lower, online_nicks))

with col3:
    st.header("Отсутствующие")
    if 'formation' in st.session_state and 'online' in st.session_state:
        missing = [nick for nick in st.session_state['online'] if nick.lower() not in st.session_state['formation']]
        st.write("Не в строю:")
        st.write(missing)
    else:
        st.write("Загрузи файлы слева для анализа.")