import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import socket from "./socket";
import Canvas from './Canvas';
import './App.css'

socket.onopen = () => {
  console.log("Server connected")
  socket.send("Message")
}

socket.onmessage = (event) => {
  console.log(event.data)
}

function App() {
  

  return (
    <>
    <Canvas></Canvas>
    </>
  )
}

export default App
