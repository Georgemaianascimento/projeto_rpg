# Use official Node LTS image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy app source
COPY . .

# Expose the port the app listens on
EXPOSE 3333

# Start the app
CMD ["npm", "start"]
