using Wolder.Core.Workspace;
using Wolder.CSharp.OpenAI.Actions;

namespace Wolder.CSharp.OpenAI;

[GenerateActionCall<GenerateClass>]
[GenerateActionCall<GenerateClasses>]
[GenerateActionCall<GenerateBlazorComponent>]
[GenerateActionCall<TransformClass>]
public partial class CSharpGenerator
{
}