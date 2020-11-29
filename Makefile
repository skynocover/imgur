NAME=imgur

dev:
	wrangler dev 

publish:
	wrangler publish

generate:
	wrangler generate $(NAME) --type=webpack
