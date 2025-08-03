# Stage 1: Build stage
# Use an official Python runtime as a parent image
FROM python:3.9-slim as builder

# Set the working directory in the container
WORKDIR /app

# Install build dependencies if any (e.g., for compiling some packages)
# For this project, it seems no special build dependencies are needed.

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
# Using --no-cache-dir reduces the image size
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application's code into the container
COPY . .

# Stage 2: Final stage
# Use a smaller, more secure base image for the final application
FROM python:3.9-slim

# Set the working directory
WORKDIR /app

# Copy installed packages from the builder stage
COPY --from=builder /usr/local/lib/python3.9/site-packages/ /usr/local/lib/python3.9/site-packages/

# Copy the application code from the builder stage
COPY --from=builder /app/ .

# Expose the port the app runs on
EXPOSE 8000

# Define the command to run the application
# The host 0.0.0.0 makes the container accessible from outside
CMD ["uvicorn", "api.index:app", "--host", "0.0.0.0", "--port", "8000"]