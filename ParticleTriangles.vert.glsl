//#extension GL_EXT_shader_texture_lod : require
//#extension GL_OES_standard_derivatives : require

in vec2 Vertex;
out vec4 Rgba;
out vec2 TriangleUv;
out vec3 FragWorldPos;
out vec4 Sphere4;	//	the shape rendered by this triangle in world space

uniform sampler2D WorldPositions;
uniform int WorldPositionsWidth;
uniform int WorldPositionsHeight;

uniform mat4 LocalToWorldTransform;
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;

uniform vec3 LocalPositions[3];/* = vec3[3](
										vec3( -1,-1,0 ),
										vec3( 1,-1,0 ),
										vec3( 0,1,0 )
										);*/
#define MAX_COLOUR_COUNT	16
uniform int ColourCount;//= 0;
uniform vec3 Colours[MAX_COLOUR_COUNT];

uniform float TriangleScale;// = 0.06;


//	world space
#define SphereRadius (TriangleScale * 0.5)
//uniform float SphereRadius = 0.04;


vec3 GetTriangleWorldPos(int TriangleIndex)
{
	float t = float(TriangleIndex);
	
	//	index->uv
	float x = mod( t, float(WorldPositionsWidth) );
	float y = (t-x) / float(WorldPositionsWidth);
	float u = x / float(WorldPositionsWidth);
	float v = y / float(WorldPositionsHeight);
	float Lod = 0.0;
	float2 uv = float2(u,v);
	float3 xyz = textureLod( WorldPositions, uv, Lod ).xyz;
	//float3 xyz = float3( x,y,0 );
	return xyz;
}

vec3 GetTriangleColour(int TriangleIndex)
{
	return vec3(1,0,0);
	/*
	if ( ColourCount == 0 )
		return vec3(1,0,0);
	
	
	return Colours[ TriangleIndex % ColourCount];
	 */
}

void main()
{
	int VertexIndex = int(Vertex.x);
	int TriangleIndex = int(Vertex.y);
	
	float3 LocalPos = LocalPositions[VertexIndex] * TriangleScale;
	float3 TrianglePos = GetTriangleWorldPos(TriangleIndex);
	float4 WorldPos = LocalToWorldTransform * float4(LocalPos,1);
	WorldPos.xyz += TrianglePos;
	WorldPos.w = 1.0;
	float4 CameraPos = WorldToCameraTransform * WorldPos;
	float4 ProjectionPos = CameraProjectionTransform * CameraPos;
	gl_Position = ProjectionPos;
	
	Rgba = float4( GetTriangleColour(TriangleIndex), 1 );
	TriangleUv = LocalPositions[VertexIndex].xy;
	FragWorldPos = WorldPos.xyz;
	Sphere4 = float4( TrianglePos, SphereRadius );
}

