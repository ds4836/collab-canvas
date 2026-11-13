import { useRef, useEffect } from "react";
import socket from "../socket";

function Canvas() {
    const canvasRef = useRef(null);
    const isDrawing = useRef(false);
    const lastPosition = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        canvas.width = 1000;
        canvas.height = 1000;

        ctx.lineWidth = 5;
        ctx.lineCap = "round";

        const handleMessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "draw") {
                drawLine(
                    ctx,
                    data.fromX,
                    data.fromY,
                    data.toX,
                    data.toY,
                    data.color,
                    data.brushSize
                );
            }
        };

        socket.addEventListener("message", handleMessage);
        return () => {
            socket.removeEventListener("message", handleMessage);
        }
    }, [])

    function drawLine(ctx, fromX, fromY, toX, toY, color, size){
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
    }

    function startDrawing(e){
        isDrawing.current = true;
        const rect = canvasRef.current.getBoundingClientRect();
        lastPosition.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }

    function draw(e) {
        if (!isDrawing.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const rect = canvas.getBoundingClientRect();

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        drawLine(ctx, fromX, fromY, x, y, "black", 5);

        if (socket.readyState === WebSocket.OPEN){
            socket.send(JSON.stringify({
                type: "draw",
                fromX,
                fromY,
                toX: x,
                toY: y,
                color: "black",
                brushSize: 5
            }))
        }
        lastPosition.current = { x, y };
    }

    function stopDrawing() {
        isDrawing.current = false;
        lastPosition.current = null;
    }

    return (
        <canvas
            ref={canvasRef}
            width={1000}
            height={1000}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            style={{ border: '1px solid #000' }}
        />
    )
}

export default Canvas;