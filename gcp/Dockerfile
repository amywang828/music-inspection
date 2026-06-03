FROM nginx:alpine
RUN apk add --no-cache openssl

RUN printf 'server {\n\
    listen 8080;\n\
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
    # 前端代理到 Cloudflare Pages（永遠保持最新版）\n\
    location / {\n\
        proxy_pass https://music-inspection.pages.dev;\n\
        proxy_ssl_server_name on;\n\
        proxy_set_header Host music-inspection.pages.dev;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_hide_header X-Frame-Options;\n\
        proxy_redirect https://music-inspection.pages.dev/ /;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
