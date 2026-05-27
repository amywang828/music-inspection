FROM nginx:alpine
RUN apk add --no-cache openssl

# 複製前端靜態檔案
COPY index.html /usr/share/nginx/html/index.html
COPY sw.js /usr/share/nginx/html/sw.js
COPY manifest.json /usr/share/nginx/html/manifest.json
COPY icons/ /usr/share/nginx/html/icons/

RUN printf 'server {\n\
    listen 8080;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # FME 帳號驗證代理\n\
    location /auth {\n\
        proxy_pass https://eip.fme.com.tw/FMEIP/AasApi/CheckUserId;\n\
        proxy_ssl_server_name on;\n\
        proxy_set_header Host eip.fme.com.tw;\n\
        proxy_set_header Content-Type "application/json";\n\
        proxy_pass_request_headers on;\n\
    }\n\
\n\
    # 前端 SPA：所有路徑都回傳 index.html\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
