
Pop.Include = function(Filename)
{
	let Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun( Source, Filename );
}

Pop.Include('PopEngineCommon/PopShaderCache.js');
Pop.Include('PopEngineCommon/PopMath.js');
Pop.Include('PopEngineCommon/PopPly.js');
Pop.Include('PopEngineCommon/PopObj.js');
Pop.Include('PopEngineCommon/PopTexture.js');
Pop.Include('PopEngineCommon/ParamsWindow.js');
Pop.Include('PopEngineCommon/PopCamera.js');

const ParticleTrianglesVertShader = Pop.LoadFileAsString('ParticleTriangles.vert.glsl');
const QuadVertShader = Pop.LoadFileAsString('Quad.vert.glsl');
const ParticleColorShader = Pop.LoadFileAsString('ParticleColour.frag.glsl');
const BlitCopyShader = Pop.LoadFileAsString('BlitCopy.frag.glsl');
const ParticlePhysicsIteration_UpdateVelocity = Pop.LoadFileAsString('PhysicsIteration_UpdateVelocity.frag.glsl');
const ParticlePhysicsIteration_UpdatePosition = Pop.LoadFileAsString('PhysicsIteration_UpdatePosition.frag.glsl');

const NoiseTexture = new Pop.Image('Noise0.png');


function GenerateRandomVertexes(OnVertex)
{
	for ( let i=0;	i<10000;	i++ )
	{
		let x = Math.random() - 0.5;
		let y = Math.random() - 0.5;
		let z = Math.random() - 0.5;
		OnVertex(x,y,z);
	}
}

function LoadPlyGeometry(RenderTarget,Filename,WorldPositionImage,Scale,VertexSkip=0,GetIndexMap=null)
{
	let VertexSize = 2;
	let VertexData = [];
	let VertexDataCount = 0;
	let TriangleIndexes = [];
	let TriangleIndexCount = 0;
	let WorldPositions = [];
	let WorldPositionsCount = 0;
	let WorldPositionSize = 3;
	let WorldMin = [null,null,null];
	let WorldMax = [null,null,null];

	let PushIndex = function(Index)
	{
		TriangleIndexes.push(Index);
	}
	let PushVertexData = function(f)
	{
		VertexData.push(f);
	}
	let GetVertexDataLength = function()
	{
		return VertexData.length;
	}
	let PushWorldPos = function(x,y,z)
	{
		WorldPositions.push([x,y,z]);
	}
	

	//	replace data with arrays... no noticable speed improvement!
	let OnMeta = function(Meta)
	{
		/*
		VertexData = new Float32Array( Meta.VertexCount * 3 * VertexSize );
		PushVertexData = function(f)
		{
			VertexData[VertexDataCount] = f;
			VertexDataCount++;
		}
		GetVertexDataLength = function()
		{
			return VertexDataCount;
		}
		*/
		
		TriangleIndexes = new Int32Array( Meta.VertexCount * 3 );
		PushIndex = function(f)
		{
			TriangleIndexes[TriangleIndexCount] = f;
			TriangleIndexCount++;
		}
		/*
		WorldPositions = new Float32Array( Meta.VertexCount * 3 );
		PushWorldPos = function(x,y,z)
		{
			WorldPositions[WorldPositionsCount+0] = x;
			WorldPositions[WorldPositionsCount+1] = y;
			WorldPositions[WorldPositionsCount+2] = z;
			WorldPositionsCount += 3;
		}
		*/
	}
	OnMeta = undefined;

	let AddTriangle = function(TriangleIndex,x,y,z)
	{
		let FirstTriangleIndex = GetVertexDataLength() / VertexSize;
		
		let Verts;
		if ( VertexSize == 2 )
			Verts = [	0,TriangleIndex,	1,TriangleIndex,	2,TriangleIndex	];
		else
			Verts = [	x,y,z,0,	x,y,z,1,	x,y,z,2	];
		Verts.forEach( v => PushVertexData(v) );
		
		PushIndex( FirstTriangleIndex+0 );
		PushIndex( FirstTriangleIndex+1 );
		PushIndex( FirstTriangleIndex+2 );
	}
	
	let TriangleCounter = 0;
	let VertexCounter = 0;
	let OnVertex = function(x,y,z)
	{
		if ( VertexCounter++ % (VertexSkip+1) > 0 )
			return;

		/*
		if ( TriangleCounter == 0 )
		{
			WorldMin = [x,y,z];
			WorldMax = [x,y,z];
		}
		*/
		AddTriangle( TriangleCounter,x,y,z );
		TriangleCounter++;
		PushWorldPos( x,y,z );
		/*
		WorldMin[0] = Math.min( WorldMin[0], x );
		WorldMin[1] = Math.min( WorldMin[1], y );
		WorldMin[2] = Math.min( WorldMin[2], z );
		WorldMax[0] = Math.max( WorldMax[0], x );
		WorldMax[1] = Math.max( WorldMax[1], y );
		WorldMax[2] = Math.max( WorldMax[2], z );
		*/
	}
	
	//let LoadTime = Pop.GetTimeNowMs();
	if ( Filename.endsWith('.ply') )
		Pop.ParsePlyFile(Filename,OnVertex,OnMeta);
	else if ( Filename.endsWith('.obj') )
		Pop.ParseObjFile(Filename,OnVertex,OnMeta);
	else if ( Filename.endsWith('.random') )
		GenerateRandomVertexes(OnVertex);
	else
		throw "Don't know how to load " + Filename;
	
	//Pop.Debug("Loading took", Pop.GetTimeNowMs()-LoadTime);
	
	if ( WorldPositionImage )
	{
		//	sort, but consistently
		if ( GetIndexMap )
		{
			let Map = GetIndexMap(WorldPositions);
			let NewPositions = [];
			Map.forEach( i => NewPositions.push(WorldPositions[i]) );
			WorldPositions = NewPositions;
		}
		
		let Unrolled = [];
		WorldPositions.forEach( xyz => {	Unrolled.push(xyz[0]);	Unrolled.push(xyz[1]);	Unrolled.push(xyz[2]);}	);
		WorldPositions = Unrolled;
		
		//let WorldPosTime = Pop.GetTimeNowMs();

		Scale = Scale||1;
		let Channels = 3;
		let Quantisise = false;
	
		let NormaliseCoordf = function(x,Index)
		{
			x *= Scale;
			return x;
		}
		
		const Width = 1024;
		const Height = Math.ceil( WorldPositions.length / WorldPositionSize / Width );
		//const Height = 10;	//	seeing if this needs to be a power in webgl for framebuffer)
		let WorldPixels = new Float32Array( Channels * Width*Height );
		//WorldPositions.copyWithin( WorldPixels );
		
		let ModifyXyz = function(Index)
		{
			Index *= Channels;
			let x = WorldPixels[Index+0];
			let y = WorldPixels[Index+1];
			let z = WorldPixels[Index+2];
			//	normalize and turn into 0-255
			x = Quantisise ? Math.Range( WorldMin[0], WorldMax[0], x ) : x;
			y = Quantisise ? Math.Range( WorldMin[1], WorldMax[1], y ) : y;
			z = Quantisise ? Math.Range( WorldMin[2], WorldMax[2], z ) : z;
			x = NormaliseCoordf(x);
			y = NormaliseCoordf(y);
			z = NormaliseCoordf(z);
			//Pop.Debug(WorldMin,WorldMax,x,y,z);
			WorldPixels[Index+0] = x;
			WorldPixels[Index+1] = y;
			WorldPixels[Index+2] = z;
		}
	
		let PushPixel = function(xyz,Index)
		{
			WorldPixels[Index*Channels+0] = xyz[0];
			WorldPixels[Index*Channels+1] = xyz[1];
			WorldPixels[Index*Channels+2] = xyz[2];
			//WorldPixels[Index*Channels+3] = 0;
			ModifyXyz( Index );
		}
		for ( let i=0;	i<WorldPositions.length;	i+=WorldPositionSize )
		{
			PushPixel( WorldPositions.slice(i,i+WorldPositionSize), i/WorldPositionSize );
		//	ModifyXyz( WorldPositions.slice(i,i+WorldPositionSize), i/WorldPositionSize );
		}
		
		//Pop.Debug("Making world positions took", Pop.GetTimeNowMs()-WorldPosTime);

		//let WriteTime = Pop.GetTimeNowMs();
		WorldPositionImage.WritePixels( Width, Height, WorldPixels, 'Float'+Channels );
		//Pop.Debug("Making world texture took", Pop.GetTimeNowMs()-WriteTime);
	}
	
	const VertexAttributeName = "Vertex";
	
	//	loads much faster as a typed array
	VertexData = new Float32Array( VertexData );
	TriangleIndexes = new Int32Array(TriangleIndexes);
	
	//let CreateBufferTime = Pop.GetTimeNowMs();
	let TriangleBuffer = new Pop.Opengl.TriangleBuffer( RenderTarget, VertexAttributeName, VertexData, VertexSize, TriangleIndexes );
	//Pop.Debug("Making triangle buffer took", Pop.GetTimeNowMs()-CreateBufferTime);
	
	return TriangleBuffer;
}


//	todo: tie with render target!
let QuadGeometry = null;
function GetQuadGeometry(RenderTarget)
{
	if ( QuadGeometry )
		return QuadGeometry;

	let VertexSize = 2;
	let l = 0;
	let t = 0;
	let r = 1;
	let b = 1;
	//let VertexData = [	l,t,	r,t,	r,b,	l,b	];
	let VertexData = [	l,t,	r,t,	r,b,	r,b, l,b, l,t	];
	let TriangleIndexes = [0,1,2,	3,4,5];
	
	const VertexAttributeName = "TexCoord";
	
	QuadGeometry = new Pop.Opengl.TriangleBuffer( RenderTarget, VertexAttributeName, VertexData, VertexSize, TriangleIndexes );
	return QuadGeometry;
}



function UnrollHexToRgb(Hexs)
{
	let Rgbs = [];
	let PushRgb = function(Hex)
	{
		let Rgb = Pop.Colour.HexToRgb(Hex);
		Rgbs.push( Rgb[0]/255 );
		Rgbs.push( Rgb[1]/255 );
		Rgbs.push( Rgb[2]/255 );
	}
	Hexs.forEach( PushRgb );
	return Rgbs;
}

//	colours from colorbrewer2.org
const DebrisColoursHex = ['#f08f11'];
//const OceanColoursHex = ['#f7fcf0','#e0f3db','#ccebc5','#a8ddb5','#7bccc4','#4eb3d3','#2b8cbe','#0868ac','#084081'];
const FogColour = Pop.Colour.HexToRgbf(0xabe6f5);
const LightColour = Pop.Colour.HexToRgbf(0xeef2df);//HexToRgbf(0x9ee5fa);

const DebrisColours = UnrollHexToRgb(DebrisColoursHex);


let Camera = new Pop.Camera();
Camera.Position = [ 0,1,5 ];

function TKeyframe(Time,Uniforms)
{
	this.Time = Time;
	this.Uniforms = Uniforms;
}

function TTimeline(Keyframes)
{
	this.Keyframes = Keyframes;
	
	this.GetTimeSlice = function(Time)
	{
		let Slice = {};
		Slice.StartIndex = 0;
		
		for ( let i=0;	i<Keyframes.length-1;	i++ )
		{
			let t = Keyframes[i].Time;
			if ( t > Time )
			{
				//Pop.Debug( "Time > t", Time, t);
				break;
			}
			Slice.StartIndex = i;
		}
		Slice.EndIndex = Slice.StartIndex+1;
		
		let StartTime = Keyframes[Slice.StartIndex].Time;
		let EndTime = Keyframes[Slice.EndIndex].Time;
		Slice.Lerp = Math.RangeClamped( StartTime, EndTime, Time );
		
		//Pop.Debug(JSON.stringify(Slice));
		return Slice;
	}
	
	this.GetUniform = function(Time,Key)
	{
		let Slice = this.GetTimeSlice( Time );
		let UniformsA = Keyframes[Slice.StartIndex].Uniforms;
		let UniformsB = Keyframes[Slice.EndIndex].Uniforms;

		let LerpUniform = function(Key)
		{
			let a = UniformsA[Key];
			let b = UniformsB[Key];
			
			let Value;
			if ( Array.isArray(a) )
				Value = Math.LerpArray( a, b, Slice.Lerp );
			else
				Value = Math.Lerp( a, b, Slice.Lerp );
			return Value;
		}
		let Value = LerpUniform( Key );
		return Value;
	}
	
	this.EnumUniforms = function(Time,EnumUniform)
	{
		let Slice = this.GetTimeSlice( Time );
		let UniformsA = Keyframes[Slice.StartIndex].Uniforms;
		let UniformsB = Keyframes[Slice.EndIndex].Uniforms;
		let UniformKeys = Object.keys(UniformsA);
		
		let LerpUniform = function(Key)
		{
			let a = UniformsA[Key];
			let b = UniformsB[Key];
			let Value;
			
			if ( Array.isArray(a) )
				Value = Math.LerpArray( a, b, Slice.Lerp );
			else
				Value = Math.Lerp( a, b, Slice.Lerp );

			//Pop.Debug(Key, Value);
			EnumUniform( Key, Value );
		}
		UniformKeys.forEach( LerpUniform );
	}
}

function PhysicsIteration(RenderTarget,Time,PositionTexture,VelocityTexture,ScratchTexture)
{
	let CopyShader = Pop.GetShader( RenderTarget, BlitCopyShader, QuadVertShader );
	let UpdateVelocityShader = Pop.GetShader( RenderTarget, ParticlePhysicsIteration_UpdateVelocity, QuadVertShader );
	let UpdatePositionsShader = Pop.GetShader( RenderTarget, ParticlePhysicsIteration_UpdatePosition, QuadVertShader );
	let Quad = GetQuadGeometry(RenderTarget);

	//	copy old velocitys
	let CopyVelcoityToScratch = function(RenderTarget)
	{
		let SetUniforms = function(Shader)
		{
			Shader.SetUniform('VertexRect', [0,0,1,1] );
			Shader.SetUniform('Texture',VelocityTexture);
		}
		RenderTarget.DrawGeometry( Quad, CopyShader, SetUniforms );
	}
	RenderTarget.RenderToRenderTarget( ScratchTexture, CopyVelcoityToScratch );
	
	//	update velocitys
	let UpdateVelocitys = function(RenderTarget)
	{
		let SetUniforms = function(Shader)
		{
			Shader.SetUniform('VertexRect', [0,0,1,1] );
			Shader.SetUniform('PhysicsStep', 1.0/60.0 );
			Shader.SetUniform('NoiseScale', 0.1 );
			Shader.SetUniform('Gravity', -0.1);
			Shader.SetUniform('Noise', RandomTexture);
			Shader.SetUniform('LastVelocitys',ScratchTexture);
			
			Timeline.EnumUniforms( Time, Shader.SetUniform.bind(Shader) );
		}
		RenderTarget.DrawGeometry( Quad, UpdateVelocityShader, SetUniforms );
	}
	RenderTarget.RenderToRenderTarget( VelocityTexture, UpdateVelocitys );
	
	//	copy old positions
	let CopyPositionsToScratch = function(RenderTarget)
	{
		let SetUniforms = function(Shader)
		{
			Shader.SetUniform('VertexRect', [0,0,1,1] );
			Shader.SetUniform('Texture',PositionTexture);
		}
		RenderTarget.DrawGeometry( Quad, CopyShader, SetUniforms );
	}
	RenderTarget.RenderToRenderTarget( ScratchTexture, CopyPositionsToScratch );

	//	update positions
	let UpdatePositions = function(RenderTarget)
	{
		let SetUniforms = function(Shader)
		{
			Shader.SetUniform('VertexRect', [0,0,1,1] );
			Shader.SetUniform('PhysicsStep', 1.0/60.0 );
			Shader.SetUniform('Velocitys',VelocityTexture);
			Shader.SetUniform('LastPositions',ScratchTexture);
			
			Timeline.EnumUniforms( Time, Shader.SetUniform.bind(Shader) );
		}
		RenderTarget.DrawGeometry( Quad, UpdatePositionsShader, SetUniforms );
	}
	RenderTarget.RenderToRenderTarget( PositionTexture, UpdatePositions );
	
}



function TPhysicsActor(Meta)
{
	this.Position = Meta.Position;
	this.TriangleBuffer = null;
	this.Colours = Meta.Colours;
	this.Meta = Meta;
	
	this.IndexMap = null;
	this.GetIndexMap = function(Positions)
	{
		//	generate
		if ( !this.IndexMap )
		{
			//	add index to each position
			let SetIndex = function(Element,Index)
			{
				Element.push(Index);
			}
			Positions.forEach( SetIndex );
			
			//	sort the positions
			let SortPosition = function(a,b)
			{
				if ( a[2] < b[2] )	return -1;
				if ( a[2] > b[2] )	return 1;
				return 0;
			}
			Positions.sort(SortPosition);
			
			//	extract new index map
			this.IndexMap = [];
			Positions.forEach( xyzi => this.IndexMap.push(xyzi[3]) );
		}
		return this.IndexMap;
	}
	
	this.PhysicsIteration = function(DurationSecs,Time,RenderTarget)
	{
		//	need data initialised
		this.GetTriangleBuffer(RenderTarget);
		
		//Pop.Debug("PhysicsIteration", JSON.stringify(this) );
		PhysicsIteration( RenderTarget, Time, this.PositionTexture, this.VelocityTexture, this.ScratchTexture );
	}
	
	this.ResetPhysicsTextures = function()
	{
		//Pop.Debug("ResetPhysicsTextures", JSON.stringify(this) );
		//	need to init these to zero?
		const Size = [ this.PositionTexture.GetWidth(), this.PositionTexture.GetHeight() ];
		this.VelocityTexture = new Pop.Image(Size,'Float4');
		this.ScratchTexture = new Pop.Image(Size,'Float4');
	}
	
	this.GetTransformMatrix = function()
	{
		return Math.CreateTranslationMatrix( ...this.Position );
	}
	
	this.GetPositionsTexture = function()
	{
		return this.PositionTexture;
	}
	
	this.GetVelocitysTexture = function()
	{
		return this.VelocityTexture;
	}
	
	this.GetTriangleBuffer = function(RenderTarget)
	{
		if ( this.TriangleBuffer )
			return this.TriangleBuffer;
		
		this.PositionTexture = new Pop.Image();
		this.TriangleBuffer = LoadPlyGeometry( RenderTarget, Meta.Filename, this.PositionTexture, Meta.Scale, Meta.VertexSkip, this.GetIndexMap.bind(this) );
		this.ResetPhysicsTextures();
		
		return this.TriangleBuffer;
	}
}



const Keyframes =
[
 new TKeyframe(	0,		{	} ),
 new TKeyframe(	10,		{	} ),
 new TKeyframe(	20,		{	} ),
 new TKeyframe(	28.9,	{	} ),
 new TKeyframe(	40,		{	} ),
 new TKeyframe(	50,		{	} ),
 new TKeyframe(	110,	{	} ),
];
const Timeline = new TTimeline( Keyframes );


let DebrisMeta = {};
DebrisMeta.Filename = '.random';
DebrisMeta.Position = [0,0,0];
DebrisMeta.Scale = 1;
DebrisMeta.TriangleScale = 0.10;
DebrisMeta.Colours = DebrisColours;
DebrisMeta.VertexSkip = 0;

let Actor_Butterflys = new TPhysicsActor( DebrisMeta );
let RandomTexture = Pop.CreateRandomImage( 512, 512 );



let Params = {};
//	todo: radial vs ortho etc
Params.DebugPhysicsTextures = false;
Params.FogMinDistance = 20;
Params.FogMaxDistance = 40;
Params.FogColour = FogColour;
Params.TriangleScale = DebrisMeta.TriangleScale;

let OnParamsChanged = function(Params)
{
	Actor_Butterflys.Meta.TriangleScale = Params.TriangleScale;
	//Actor_Debris.Meta.TriangleScale = Params.Debris_TriangleScale;
}

let ParamsWindow = new CreateParamsWindow(Params,OnParamsChanged);
ParamsWindow.AddParam('DebugPhysicsTextures');
ParamsWindow.AddParam('FogMinDistance',0,30);
ParamsWindow.AddParam('FogMaxDistance',0,30);
ParamsWindow.AddParam('TriangleScale',0,0.2);
ParamsWindow.AddParam('FogColour','Colour');


function RenderActor(RenderTarget,Actor,Time)
{
	if ( !Actor )
		return;
	
	const Viewport = RenderTarget.GetScreenRect();
	const CameraProjectionTransform = Camera.GetProjectionMatrix(Viewport);
	const WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
	const Shader = Pop.GetShader( RenderTarget, ParticleColorShader, ParticleTrianglesVertShader );
	const TriangleBuffer = Actor.GetTriangleBuffer(RenderTarget);
	const PositionsTexture = Actor.GetPositionsTexture();
	const VelocitysTexture = Actor.GetVelocitysTexture();
	const ScratchTexture = Actor.ScratchTexture;
	const BlitShader = Pop.GetShader( RenderTarget, BlitCopyShader, QuadVertShader );
	
	//Pop.Debug("CameraProjectionTransform",CameraProjectionTransform);
	//Pop.Debug("WorldToCameraTransform",WorldToCameraTransform);
	//Pop.Debug('LocalToWorldTransform', Actor.GetTransformMatrix() );
	
	const LocalPositions = [ -1,-1,0,	1,-1,0,	0,1,0	];
	
	let SetUniforms = function(Shader)
	{
		Shader.SetUniform('LocalPositions', LocalPositions );
		
		Shader.SetUniform('WorldPositions',PositionsTexture);
		Shader.SetUniform('WorldPositionsWidth',PositionsTexture.GetWidth());
		Shader.SetUniform('WorldPositionsHeight',PositionsTexture.GetHeight());
		
		Shader.SetUniform('LocalToWorldTransform', Actor.GetTransformMatrix() );
		Shader.SetUniform('TriangleScale', Actor.Meta.TriangleScale);
		
		Shader.SetUniform('Colours',Actor.Colours);
		Shader.SetUniform('ColourCount',Actor.Colours.length/3);
		Shader.SetUniform('WorldToCameraTransform', WorldToCameraTransform );
		Shader.SetUniform('CameraProjectionTransform', CameraProjectionTransform );
		Shader.SetUniform('Fog_MinDistance',Params.FogMinDistance);
		Shader.SetUniform('Fog_MaxDistance',Params.FogMaxDistance);
		Shader.SetUniform('Fog_Colour',Params.FogColour);
		Shader.SetUniform('Light_Colour', LightColour );
		Shader.SetUniform('Light_MinPower', 0.1 );
		Shader.SetUniform('Light_MaxPower', 1.0 );

		Timeline.EnumUniforms( Time, Shader.SetUniform.bind(Shader) );
	};
	
	RenderTarget.DrawGeometry( TriangleBuffer, Shader, SetUniforms );
	
	if ( Params.DebugPhysicsTextures )
	{
		let Quad = GetQuadGeometry(RenderTarget);
		let SetDebugPositionsUniforms = function(Shader)
		{
			Shader.SetUniform('VertexRect', [0, 0, 0.2, 0.25 ] );
			Shader.SetUniform('Texture',PositionsTexture);
		};
		let SetDebugVelocitysUniforms = function(Shader)
		{
			Shader.SetUniform('VertexRect', [0, 0.3, 0.2, 0.25 ] );
			Shader.SetUniform('Texture',VelocitysTexture);
		};
		let SetDebugScratchTextureUniforms = function(Shader)
		{
			Shader.SetUniform('VertexRect', [0, 0.6, 0.2, 0.25 ] );
			Shader.SetUniform('Texture',ScratchTexture);
		};
		
		RenderTarget.DrawGeometry( Quad, BlitShader, SetDebugPositionsUniforms );
		RenderTarget.DrawGeometry( Quad, BlitShader, SetDebugVelocitysUniforms );
		RenderTarget.DrawGeometry( Quad, BlitShader, SetDebugScratchTextureUniforms );
	}
}

let GlobalTime = 0;
function Render(RenderTarget)
{
	const DurationSecs = 1 / 60;
	GlobalTime += DurationSecs;
	
	Actor_Butterflys.PhysicsIteration( DurationSecs, GlobalTime, RenderTarget );

	RenderTarget.ClearColour( ...Params.FogColour );
	
	RenderActor( RenderTarget, Actor_Butterflys, GlobalTime );
	
}

let Window = new Pop.Opengl.Window("Flutterbys"/*, [10,10,300,300]*/ );
Window.OnRender = Render;

Window.OnMouseDown = function(x,y,Button)
{
	Camera.OnCameraOrbit( x, y, 0, true );
}

Window.OnMouseMove = function(x,y,Button)
{
	//	gr: we should change Button to undefined, not -1
	if ( Button >= 0 && Button !== undefined )
		Camera.OnCameraOrbit( x, y, 0, false );
};

