/**
 * 基础词表（A1–A2 高频词，按 lemma 收录）。
 *
 * 考研 / 四六级词库里连 the、a、of、be、have 这类最基础的词也收录了，
 * 正文里几乎每个词都会被标注，反而淹没真正需要学的词。
 * 这份列表默认把这些词从「词纲命中」中排除；可以在阅读器「更多」菜单里关闭过滤。
 */
const BASIC = `
a an the this that these those there here
i me my mine myself you your yours yourself he him his himself she her hers herself
it its itself we us our ours ourselves they them their theirs themselves
who whom whose which what when where why how whoever whatever
be am is are was were been being
do does did done doing
have has had having
will would shall should can could may might must ought
not no nor never none nothing nobody nowhere neither either
and or but so yet for because if unless though although while whereas
as than then thus therefore however moreover also too very just only even still already
of to in on at by with from into onto upon about above below over under between among
through during before after since until till against across along around behind beyond
without within via per despite except besides toward towards off out up down
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen
sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety
hundred thousand million billion first second third fourth fifth last next
day week month year hour minute second morning afternoon evening night today tomorrow yesterday
time times moment period while
man woman men women boy girl child children baby person people human family friend
mother father mom dad parent parents brother sister son daughter husband wife
home house room door window street city town country world place way
school class book page word name number line part thing things
work 
life live lives death die dead
hand head eye eyes face body heart mind
water food eat drink sleep walk run sit stand get got go goes going gone come came coming
see saw seen look watch hear listen speak talk say said tell told ask answer
know knew known think thought understand remember forget learn study teach
want need like love hate hope wish try use make made take took taken give gave given
find found keep kept let leave left put set send sent bring brought buy bought
pay sell read write written draw sing play game
big small large little long short high low old new young good bad better best worse worst
great nice fine happy sad angry tired easy hard 
same other another each every all both some any many much more most few less least
own own other such
hot cold warm cool dry wet fast slow early late right wrong true false real sure
open close opened closed start stop begin end finish continue wait help
call called turn turned move moved carry carried hold held become became
seem seemed feel felt look looked remain stay
today tonight ago soon now later always sometimes usually often rarely
yes no ok okay please thanks thank hello hi bye goodbye
mister sir madam
here's that's it's i'm you're we're they're don't doesn't didn't isn't aren't wasn't weren't
can't couldn't won't wouldn't shouldn't
`;

const KEEP = /^[a-z]+(?:'[a-z]+)?$/;

export const BASIC_WORDS: Set<string> = new Set(
 BASIC.split(/\s+/).map((word) => word.trim().toLowerCase()).filter(Boolean),
);

/**
 * 有些词形还原表会把缩写或带撇号的词映射过来；过滤时统一取词元。
 */
export function isBasicWord(lemma: string | null | undefined): boolean {
 if (!lemma) return false;
 const key = lemma.trim().toLowerCase();
 if (!KEEP.test(key)) return false;
 return BASIC_WORDS.has(key);
}
