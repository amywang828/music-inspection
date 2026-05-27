FROM nginx:alpine
RUN apk add --no-cache openssl
RUN printf 'server {\n\
    listen 8080;\n\
    location /auth {\n\
        proxy_pass https://eip.fme.com.tw/FMEIP/AasApi/CheckUserId;\n\
        proxy_ssl_server_name on;\n\
        proxy_set_header Host eip.fme.com.tw;\n\
        proxy_set_header Content-Type "application/json";\n\
        proxy_pass_request_headers on;\n\
    }\n\
    location / {\n\
        return 200 "{\"status\":\"ok\"}";\n\
        add_header Content-Type application/json;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
