// #RecodeRethink https://openprocessing.org/curation/72108
// Recode: https://openprocessing.org/sketch/2027130
//
// "Not Safe" by ZRNOF
// Inspired by Etienne Jacob (https://bleuje.com/)

const [width, height] = [1280, 1280]

const main = async () => {
	// canvas
	const canvasWebGL2 = document.getElementById("canvasWebGL2")
	const canvas2D = document.getElementById("canvas2D")

	// webgl2 setup
	const gl = canvasWebGL2.getContext("webgl2")
	const program = gl.createProgram()
	setShader(gl, program, vert, frag)
	gl.linkProgram(program)
	gl.useProgram(program)

	// resize
	resizeCanvas(canvasWebGL2, gl, width, height)
	resizeCanvas(canvas2D, gl, width, height)

	// set random value
	const randomVec2 = [random(0, 300), random(0, 300)]
	const randomVec2Loc = gl.getUniformLocation(program, "uRandomVec2")
	gl.uniform2fv(randomVec2Loc, randomVec2)

	// buffer data
	let positionData = []
	let offsetData = []
	let texCoordData = []

	// generate buffer data
	const cols = width / 2
	const rows = height / 2
	const [xOff, yOff] = [2 / cols, 2 / rows]
	const [uOff, vOff] = [1 / cols, 1 / rows]
	// noprotect
	for (let col = 0; col < cols; col++) {
		for (let row = 0; row < rows; row++) {
			positionData.push(-1 + xOff * col + 1 / cols)
			positionData.push(1 - yOff * row - 1 / rows)
			texCoordData.push((col + 1 / cols) * uOff)
			texCoordData.push((row + 1 / rows) * vOff)
		}
	}

	// set attribute
	setAttributeVec2(gl, program, "aPosition", positionData)
	setAttributeVec2(gl, program, "aTexCoord", texCoordData)

	// set time
	let time = 0
	const timeLoc = gl.getUniformLocation(program, "uTime")

	// draw call
	const draw = () => {
		gl.clearColor(0, 0, 0, 0.1)
		gl.clear(gl.COLOR_BUFFER_BIT)
		gl.uniform1f(timeLoc, time) // time
		gl.drawArrays(gl.POINTS, 0, cols * rows)
		time += 0.02
		drawImage(canvasWebGL2, canvas2D)
		window.requestAnimationFrame(draw)
	}

	draw()
}

main()
